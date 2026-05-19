/**
 * Workspace — operations on a polyskill project directory.
 *
 * A workspace is any directory containing `polyskill.yaml` + `definition.md`.
 * Build state (hashes for drift detection) lives in `.polyskill/state.json`.
 */

import path from 'node:path';
import os from 'node:os';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { readFileIfExists, writeFile, pathExists, hashFile } from './utils/fs.js';

export interface WorkspaceConfig {
  /** Schema version for forward compat. */
  version: 1;
  /** Targets to emit when `polyskill build` runs with no args. */
  targets: TargetConfig[];
}

export interface TargetConfig {
  /** Adapter name, e.g. "claude" or "codex". */
  adapter: string;
  /** Destination directory for `build` output (relative to workspace root). */
  path: string;
  /**
   * Absolute install path for `polyskill install`. If omitted, falls back to
   * a sensible default (~/.claude/skills for claude, ~/.agents/skills for codex).
   * Supports ~ expansion.
   */
  install?: string;
  /** If true, build will overwrite without drift checks. */
  force?: boolean;
}

export interface BuildState {
  /** Map of file path -> hash, from the last successful build. */
  files: Record<string, string>;
  /** ISO timestamp of last build. */
  built_at?: string;
}

const CONFIG_FILENAME = 'polyskill.yaml';
const STATE_PATH = '.polyskill/state.json';

export async function readConfig(workspaceDir: string): Promise<WorkspaceConfig | null> {
  const raw = await readFileIfExists(path.join(workspaceDir, CONFIG_FILENAME));
  if (!raw) return null;
  try {
    const parsed = yamlLoad(raw) as WorkspaceConfig;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeConfig(workspaceDir: string, config: WorkspaceConfig): Promise<void> {
  const content = yamlDump(config, { lineWidth: 100, noRefs: true });
  await writeFile(path.join(workspaceDir, CONFIG_FILENAME), content);
}

export async function readState(workspaceDir: string): Promise<BuildState> {
  const raw = await readFileIfExists(path.join(workspaceDir, STATE_PATH));
  if (!raw) return { files: {} };
  try {
    return JSON.parse(raw) as BuildState;
  } catch {
    return { files: {} };
  }
}

export async function writeState(workspaceDir: string, state: BuildState): Promise<void> {
  await writeFile(path.join(workspaceDir, STATE_PATH), JSON.stringify(state, null, 2));
}

export async function detectDrift(
  workspaceDir: string,
  filePath: string,
  state: BuildState
): Promise<'unchanged' | 'drifted' | 'new'> {
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceDir, filePath);
  const lastHash = state.files[filePath];
  if (!lastHash) return 'new';
  const currentHash = await hashFile(absPath);
  if (currentHash === null) return 'new';
  return currentHash === lastHash ? 'unchanged' : 'drifted';
}

export async function isWorkspace(dir: string): Promise<boolean> {
  return pathExists(path.join(dir, CONFIG_FILENAME));
}

export function defaultConfig(): WorkspaceConfig {
  return {
    version: 1,
    targets: [
      { adapter: 'claude', path: 'dist/claude' },
      { adapter: 'codex', path: 'dist/codex' },
    ],
  };
}

/**
 * Resolve the install destination for a target.
 *   1. If target.install is set, expand `~` and return.
 *   2. Otherwise fall back to a sensible default per adapter.
 *   3. Returns null if no default is known (the install command will error).
 */
export function resolveInstallPath(target: TargetConfig, skillName: string): string | null {
  if (target.install) {
    return expandTilde(target.install).replace(/<name>|<skill>/g, skillName);
  }
  const defaults: Record<string, string> = {
    claude: path.join(os.homedir(), '.claude', 'skills', skillName),
    codex: path.join(os.homedir(), '.agents', 'skills', skillName),
  };
  return defaults[target.adapter] ?? null;
}

function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}
