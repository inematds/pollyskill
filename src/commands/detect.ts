import chalk from 'chalk';
import { detectAllRuntimes } from '../utils/runtimes.js';

/**
 * `polyskill detect` — show which runtimes are installed on this machine
 * and where their skills directories live. Useful diagnostic before install.
 */
export async function detectCommand(): Promise<void> {
  const results = await detectAllRuntimes();

  console.log(chalk.bold('Runtime detection'));
  console.log('');

  for (const r of results) {
    if (r.installed) {
      console.log(`${chalk.green('✓')} ${r.label.padEnd(15)} ${chalk.dim('marker:')} ${prettifyHome(r.marker!)}`);
      console.log(`  ${chalk.dim('skills →')} ${prettifyHome(r.skillsPath)}`);
    } else {
      console.log(`${chalk.yellow('○')} ${r.label.padEnd(15)} ${chalk.dim('not detected')}`);
      console.log(`  ${chalk.dim('would install at:')} ${prettifyHome(r.skillsPath)}`);
    }
    console.log('');
  }

  const detected = results.filter((r) => r.installed);
  if (detected.length === 0) {
    console.log(chalk.yellow('No supported runtimes detected. Install Claude Code or OpenAI Codex first.'));
  } else {
    console.log(chalk.dim(`Detected ${detected.length} of ${results.length} supported runtimes.`));
  }
}

function prettifyHome(p: string): string {
  const home = process.env.HOME ?? '';
  if (home && p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}
