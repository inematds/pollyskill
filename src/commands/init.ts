import path from 'node:path';
import chalk from 'chalk';
import { getAdapter } from '../adapters/index.js';
import { defaultConfig, isWorkspace, writeConfig } from '../workspace.js';
import { emptyIR } from '../ir.js';
import { ensureDir, pathExists } from '../utils/fs.js';

export async function initCommand(name: string, opts: { dir?: string }): Promise<void> {
  const targetDir = opts.dir ? path.resolve(opts.dir) : path.resolve(process.cwd(), name);

  if (await pathExists(targetDir)) {
    if (await isWorkspace(targetDir)) {
      console.log(chalk.yellow(`✗ ${targetDir} already contains a polyskill workspace.`));
      return;
    }
  }

  await ensureDir(targetDir);

  // Seed an IR with the chosen name and a placeholder description.
  const ir = emptyIR(name);
  ir.identity.description.full =
    `Describe what this skill does in 1-3 sentences. Use when the user wants to <X>. Use also when they reference <Y>.`;
  ir.activation.triggers = ['<trigger-keyword-1>', '<trigger-keyword-2>'];
  ir.behavior.body = [
    `# ${name}`,
    '',
    'Replace this body with the actual skill instructions.',
    '',
    '## Steps',
    '',
    '1. First, do X.',
    '2. Then, do Y.',
    '3. Finally, confirm Z.',
    '',
    '## Notes',
    '',
    '- This skill works in both Claude Code and Codex.',
    '- Edit `definition.md`, then run `polyskill build`.',
  ].join('\n');

  const portable = getAdapter('portable');
  const result = await portable.emit(ir, targetDir);

  await writeConfig(targetDir, defaultConfig());

  console.log(chalk.green('✓ Initialized polyskill workspace'));
  console.log(`  ${chalk.dim('path:')} ${targetDir}`);
  for (const f of result.files) {
    console.log(`  ${chalk.dim('wrote:')} ${path.relative(targetDir, f.path)}`);
  }
  console.log(`  ${chalk.dim('wrote:')} polyskill.yaml`);
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  ${chalk.cyan('cd')} ${path.relative(process.cwd(), targetDir) || '.'}`);
  console.log(`  ${chalk.cyan('# edit definition.md')}`);
  console.log(`  ${chalk.cyan('polyskill build')}`);
}
