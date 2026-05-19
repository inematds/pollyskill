/**
 * Runtime detection — figure out whether Claude Code, Codex, or another
 * runtime is installed on the current machine, without searching the
 * filesystem. We check a handful of well-known marker paths per runtime.
 *
 * Cross-platform: uses os.homedir() which resolves to:
 *   - macOS:   /Users/<name>
 *   - Linux:   /home/<name>
 *   - Windows: C:\Users\<name>
 *
 * No search is performed. The runtimes publish stable install locations;
 * we trust the documented paths and let the user override via polyskill.yaml
 * if their setup is non-standard.
 */

import os from 'node:os';
import path from 'node:path';
import { pathExists } from './fs.js';

export interface RuntimeDetection {
  /** Adapter name. */
  adapter: string;
  /** True if a marker file/directory was found. */
  installed: boolean;
  /** Where skills should be installed. */
  skillsPath: string;
  /** The marker that proved it's installed, if any. */
  marker?: string;
  /** Human label for CLI output. */
  label: string;
}

/**
 * Markers per runtime — each entry is a path relative to the user's home.
 * Order matters: the first existing path wins.
 */
const RUNTIME_MARKERS: Record<string, { label: string; skillsSubpath: string; markers: string[] }> = {
  claude: {
    label: 'Claude Code',
    skillsSubpath: '.claude/skills',
    markers: ['.claude', '.claude/skills', '.claude/settings.json'],
  },
  codex: {
    label: 'OpenAI Codex',
    skillsSubpath: '.agents/skills',
    markers: ['.codex', '.codex/config.toml', '.agents/skills'],
  },
};

export async function detectRuntime(adapter: string): Promise<RuntimeDetection | null> {
  const config = RUNTIME_MARKERS[adapter];
  if (!config) return null;

  const home = os.homedir();
  const skillsPath = path.join(home, config.skillsSubpath);

  for (const marker of config.markers) {
    const fullPath = path.join(home, marker);
    if (await pathExists(fullPath)) {
      return {
        adapter,
        installed: true,
        skillsPath,
        marker: fullPath,
        label: config.label,
      };
    }
  }

  return {
    adapter,
    installed: false,
    skillsPath,
    label: config.label,
  };
}

export async function detectAllRuntimes(): Promise<RuntimeDetection[]> {
  const adapters = Object.keys(RUNTIME_MARKERS);
  return Promise.all(adapters.map((a) => detectRuntime(a))).then((results) =>
    results.filter((r): r is RuntimeDetection => r !== null)
  );
}
