import path from 'node:path';
import chalk from 'chalk';
import { getAdapter } from '../adapters/index.js';
import { detectDrift, isWorkspace, readConfig, readState } from '../workspace.js';

/**
 * Reconcile — when a built target has been hand-edited since last build,
 * surface the drift and explain how to resolve it.
 *
 * v1 is informational only: it lists drifted files and tells the user
 * either to `polyskill build --force` (overwrite) or to manually copy
 * the changes back into definition.md. v2 will offer interactive merge.
 */
export async function reconcileCommand(): Promise<void> {
  const workspaceDir = process.cwd();
  if (!(await isWorkspace(workspaceDir))) {
    console.log(chalk.red(`✗ Not a polyskill workspace.`));
    process.exitCode = 1;
    return;
  }

  const config = await readConfig(workspaceDir);
  if (!config) {
    console.log(chalk.red('✗ Failed to read polyskill.yaml'));
    process.exitCode = 1;
    return;
  }

  const state = await readState(workspaceDir);
  let totalDrift = 0;

  for (const target of config.targets) {
    const adapter = getAdapter(target.adapter);
    const targetRel = path.relative(workspaceDir, path.resolve(workspaceDir, target.path));
    const trackedFiles = Object.keys(state.files).filter((f) => f.startsWith(targetRel));

    const drifted: string[] = [];
    for (const f of trackedFiles) {
      const status = await detectDrift(workspaceDir, f, state);
      if (status === 'drifted') drifted.push(f);
    }

    if (drifted.length === 0) continue;

    totalDrift += drifted.length;
    console.log(chalk.bold.red(`${adapter.label}: ${drifted.length} drifted file(s)`));
    for (const f of drifted) {
      console.log(`  ${chalk.red('✗')} ${f}`);
    }
    console.log('');
    console.log(chalk.bold('  How to resolve:'));
    console.log(`  ${chalk.dim('1.')} If the hand-edit was right, copy the relevant changes into ${chalk.cyan('definition.md')} and run ${chalk.cyan('polyskill build')}.`);
    console.log(`  ${chalk.dim('2.')} If the definition.md is right, run ${chalk.cyan('polyskill build --force')} to overwrite.`);
    console.log('');
  }

  if (totalDrift === 0) {
    console.log(chalk.green('✓ No drift detected — all targets in sync with last build.'));
  } else {
    process.exitCode = 1;
  }
}
