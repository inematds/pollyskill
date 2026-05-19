import path from 'node:path';
import { promises as fs } from 'node:fs';
import chalk from 'chalk';
import { getAdapter } from '../adapters/index.js';
import {
  isWorkspace,
  readConfig,
  resolveInstallPath,
  type TargetConfig,
} from '../workspace.js';
import { ensureDir, pathExists } from '../utils/fs.js';
import { detectRuntime } from '../utils/runtimes.js';
import { buildCommand } from './build.js';

/**
 * `polyskill install` — build, then copy each target's output directory
 * into the runtime's well-known skills location.
 *
 *   claude → ~/.claude/skills/<name>/
 *   codex  → ~/.agents/skills/<name>/
 *
 * Override per target by setting `install:` in polyskill.yaml.
 */
export async function installCommand(opts: {
  target?: string;
  force?: boolean;
  skipBuild?: boolean;
}): Promise<void> {
  const workspaceDir = process.cwd();
  if (!(await isWorkspace(workspaceDir))) {
    console.log(chalk.red(`✗ Not a polyskill workspace.`));
    process.exitCode = 1;
    return;
  }

  // Always build first unless the caller opts out — the install is only as
  // current as the latest build.
  if (!opts.skipBuild) {
    await buildCommand({ target: opts.target, force: opts.force });
    if (process.exitCode === 1) return; // build failed; abort install
  }

  const config = await readConfig(workspaceDir);
  if (!config) {
    console.log(chalk.red('✗ Failed to read polyskill.yaml'));
    process.exitCode = 1;
    return;
  }

  const portable = getAdapter('portable');
  const { ir } = await portable.parse(workspaceDir);
  if (!ir.identity.name) {
    console.log(chalk.red('✗ Skill name is empty — fix definition.md.'));
    process.exitCode = 1;
    return;
  }

  const targetsToInstall = opts.target
    ? config.targets.filter((t) => t.adapter === opts.target)
    : config.targets;

  console.log('');
  console.log(chalk.bold(`Installing ${ir.identity.name}`));

  for (const target of targetsToInstall) {
    await installOne(workspaceDir, target, ir.identity.name);
  }
}

async function installOne(
  workspaceDir: string,
  target: TargetConfig,
  skillName: string
): Promise<void> {
  const adapter = getAdapter(target.adapter);
  const sourceDir = path.resolve(workspaceDir, target.path, skillName);
  const destDir = resolveInstallPath(target, skillName);

  if (!destDir) {
    console.log(
      `  ${chalk.yellow('!')} ${adapter.label}: no default install path; set ${chalk.cyan('install:')} in polyskill.yaml`
    );
    return;
  }

  if (!(await pathExists(sourceDir))) {
    console.log(
      `  ${chalk.yellow('!')} ${adapter.label}: nothing built at ${sourceDir} — did the build fail?`
    );
    return;
  }

  // Friendly check: if the runtime doesn't appear installed on this machine,
  // we'll still install (the user may be prepping for a future install) but
  // we surface the warning so they don't wonder why nothing picks it up.
  const detection = await detectRuntime(target.adapter);
  if (detection && !detection.installed && !target.install) {
    console.log(
      `  ${chalk.yellow('!')} ${adapter.label} not detected on this machine — no marker found at ~/.claude, ~/.codex, or ~/.agents/skills.`
    );
    console.log(
      `    ${chalk.dim('Installing anyway at')} ${prettifyHome(destDir)}${chalk.dim('. Install the runtime first if you want it to load.')}`
    );
  }

  await ensureDir(path.dirname(destDir));

  // Wipe the existing install so removed files don't linger.
  if (await pathExists(destDir)) {
    await fs.rm(destDir, { recursive: true, force: true });
  }

  await fs.cp(sourceDir, destDir, { recursive: true });
  console.log(`  ${chalk.green('✓')} ${adapter.label.padEnd(15)} → ${prettifyHome(destDir)}`);
}

function prettifyHome(p: string): string {
  const home = process.env.HOME ?? '';
  if (home && p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}
