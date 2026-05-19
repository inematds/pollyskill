import path from 'node:path';
import chalk from 'chalk';
import { getAdapter } from '../adapters/index.js';
import { defaultConfig, writeConfig } from '../workspace.js';
import { ensureDir, pathExists } from '../utils/fs.js';
import { copyTreeExcept, IMPORT_EXCLUDES } from '../utils/copy.js';

export async function importCommand(
  sourcePath: string,
  opts: { from: string; out?: string }
): Promise<void> {
  const sourceAbs = path.resolve(sourcePath);
  if (!(await pathExists(sourceAbs))) {
    console.log(chalk.red(`✗ Source path does not exist: ${sourceAbs}`));
    process.exitCode = 1;
    return;
  }

  const sourceAdapter = getAdapter(opts.from);
  const { ir, warnings } = await sourceAdapter.parse(sourceAbs);

  if (!ir.identity.name) {
    console.log(chalk.red(`✗ Could not determine skill name from ${sourceAbs}`));
    process.exitCode = 1;
    return;
  }

  const destDir = opts.out ? path.resolve(opts.out) : path.resolve(process.cwd(), ir.identity.name);
  await ensureDir(destDir);

  const portable = getAdapter('portable');
  const result = await portable.emit(ir, destDir);
  await writeConfig(destDir, defaultConfig());

  // Carry through any supporting files (scripts/, references/, assets/, etc.)
  // so the workspace is self-contained.
  const carry = await copyTreeExcept(sourceAbs, destDir, IMPORT_EXCLUDES);

  console.log(chalk.green(`✓ Imported skill from ${sourceAdapter.label}`));
  console.log(`  ${chalk.dim('source:')} ${sourceAbs}`);
  console.log(`  ${chalk.dim('skill: ')} ${ir.identity.name}`);
  for (const f of result.files) {
    console.log(`  ${chalk.dim('wrote: ')} ${path.relative(process.cwd(), f.path)}`);
  }
  if (carry.copied.length > 0) {
    console.log(`  ${chalk.dim('carry: ')} ${carry.copied.join(', ')}`);
  }

  if (warnings.length > 0) {
    console.log('');
    console.log(chalk.yellow('Warnings:'));
    for (const w of warnings) console.log(`  ${chalk.yellow('!')} ${w}`);
  }

  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  ${chalk.cyan('cd')} ${path.relative(process.cwd(), destDir) || '.'}`);
  console.log(`  ${chalk.cyan('polyskill build')}   ${chalk.dim('# emit to all configured targets')}`);
}
