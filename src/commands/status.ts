import path from 'node:path';
import chalk from 'chalk';
import { getAdapter } from '../adapters/index.js';
import { detectDrift, isWorkspace, readConfig, readState } from '../workspace.js';

export async function statusCommand(): Promise<void> {
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

  const portable = getAdapter('portable');
  const { ir } = await portable.parse(workspaceDir);
  const state = await readState(workspaceDir);

  console.log(chalk.bold(`Skill: ${ir.identity.name || chalk.red('(unnamed)')}`));
  console.log(`${chalk.dim('description:')} ${truncate(ir.identity.description.full, 80)}`);
  if (state.built_at) {
    console.log(`${chalk.dim('last build:')} ${state.built_at}`);
  } else {
    console.log(`${chalk.dim('last build:')} ${chalk.yellow('(never)')}`);
  }
  console.log('');

  for (const target of config.targets) {
    const adapter = getAdapter(target.adapter);
    const targetRel = path.relative(workspaceDir, path.resolve(workspaceDir, target.path));
    const trackedFiles = Object.keys(state.files).filter((f) => f.startsWith(targetRel));

    if (trackedFiles.length === 0) {
      console.log(`${chalk.dim('○')} ${adapter.label.padEnd(20)} ${chalk.dim('not built')}`);
      continue;
    }

    let drifted = 0;
    let missing = 0;
    for (const f of trackedFiles) {
      const drift = await detectDrift(workspaceDir, f, state);
      if (drift === 'new') missing++;
      else if (drift === 'drifted') drifted++;
    }

    if (drifted === 0 && missing === 0) {
      console.log(`${chalk.green('✓')} ${adapter.label.padEnd(20)} in sync (${trackedFiles.length} files)`);
    } else {
      const parts: string[] = [];
      if (drifted > 0) parts.push(chalk.red(`${drifted} drifted`));
      if (missing > 0) parts.push(chalk.yellow(`${missing} missing`));
      console.log(`${chalk.red('✗')} ${adapter.label.padEnd(20)} ${parts.join(', ')}`);
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
