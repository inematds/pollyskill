import chalk from 'chalk';
import { getAdapter, listRuntimeAdapters } from '../adapters/index.js';
import { isWorkspace, readConfig } from '../workspace.js';

export async function validateCommand(): Promise<void> {
  const workspaceDir = process.cwd();
  if (!(await isWorkspace(workspaceDir))) {
    console.log(chalk.red(`✗ Not a polyskill workspace.`));
    process.exitCode = 1;
    return;
  }

  const config = await readConfig(workspaceDir);
  const portable = getAdapter('portable');
  const { ir, warnings } = await portable.parse(workspaceDir);

  let hadError = false;

  // Portable spec validation first.
  const portableResult = portable.validate(ir);
  console.log(chalk.bold('Portable definition'));
  if (portableResult.ok && portableResult.issues.length === 0) {
    console.log(`  ${chalk.green('✓')} ok`);
  } else {
    for (const issue of portableResult.issues) {
      const tag =
        issue.severity === 'error'
          ? chalk.red('✗')
          : issue.severity === 'warning'
            ? chalk.yellow('!')
            : chalk.dim('·');
      console.log(`  ${tag} ${issue.field}: ${issue.message}`);
      if (issue.severity === 'error') hadError = true;
    }
  }
  for (const w of warnings) {
    console.log(`  ${chalk.yellow('!')} ${w}`);
  }
  console.log('');

  // Validate against each configured target runtime.
  const targetAdapters = config
    ? config.targets.map((t) => getAdapter(t.adapter))
    : listRuntimeAdapters();

  for (const adapter of targetAdapters) {
    const result = adapter.validate(ir);
    console.log(chalk.bold(adapter.label));
    if (result.ok && result.issues.length === 0) {
      console.log(`  ${chalk.green('✓')} ok`);
    } else {
      for (const issue of result.issues) {
        const tag =
          issue.severity === 'error'
            ? chalk.red('✗')
            : issue.severity === 'warning'
              ? chalk.yellow('!')
              : chalk.dim('·');
        console.log(`  ${tag} ${issue.field}: ${issue.message}`);
        if (issue.severity === 'error') hadError = true;
      }
    }
    console.log('');
  }

  if (hadError) process.exitCode = 1;
}
