#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { importCommand } from './commands/import.js';
import { buildCommand } from './commands/build.js';
import { statusCommand } from './commands/status.js';
import { validateCommand } from './commands/validate.js';
import { reconcileCommand } from './commands/reconcile.js';
import { installCommand } from './commands/install.js';
import { detectCommand } from './commands/detect.js';
import { listAdapters } from './adapters/index.js';

const program = new Command();

program
  .name('polyskill')
  .description('Universal adapter for Agent Skills. Write once, run optimally in Claude Code, Codex, and any future runtime.')
  .version('0.1.0');

program
  .command('init <name>')
  .description('Bootstrap a new portable skill workspace')
  .option('-d, --dir <path>', 'directory to create (defaults to <name>)')
  .action((name, opts) => initCommand(name, opts));

program
  .command('import <source-path>')
  .description('Import a runtime-specific skill into the portable definition format')
  .requiredOption('--from <adapter>', 'source adapter (claude | codex | ...)')
  .option('--out <path>', 'output workspace directory (defaults to ./<skill-name>)')
  .action((sourcePath, opts) => importCommand(sourcePath, opts));

program
  .command('build')
  .description('Emit the portable definition to all configured runtime targets')
  .option('--target <adapter>', 'build only the named target (claude | codex | ...)')
  .option('--force', 'overwrite drifted target files without prompting')
  .action((opts) => buildCommand(opts));

program
  .command('install')
  .description('Build, then copy each target into the runtime\'s skills directory (~/.claude/skills, ~/.agents/skills)')
  .option('--target <adapter>', 'install only the named target (claude | codex | ...)')
  .option('--force', 'overwrite drifted target files during the build step')
  .option('--skip-build', 'skip the build step and only copy existing dist output')
  .action((opts) => installCommand(opts));

program
  .command('status')
  .description('Show which targets are in sync with the last build')
  .action(() => statusCommand());

program
  .command('validate')
  .description('Lint the definition against every configured target runtime')
  .action(() => validateCommand());

program
  .command('reconcile')
  .description('Inspect drifted target files and explain how to resolve them')
  .action(() => reconcileCommand());

program
  .command('detect')
  .description('Show which runtimes are installed on this machine and where their skills directories live')
  .action(() => detectCommand());

program
  .command('adapters')
  .description('List installed adapters')
  .action(() => {
    console.log(chalk.bold('Installed adapters:'));
    for (const a of listAdapters()) {
      console.log(`  ${chalk.cyan(a.name.padEnd(12))} ${a.label}  ${chalk.dim('→ ' + a.defaultEmitPath)}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
