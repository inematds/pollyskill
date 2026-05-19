import path from 'node:path';
import chalk from 'chalk';
import { getAdapter } from '../adapters/index.js';
import { detectDrift, isWorkspace, readConfig, readState, writeState } from '../workspace.js';
import { pathExists, hashString } from '../utils/fs.js';
import { promises as fs } from 'node:fs';
import { copyTreeExcept, BUILD_EXCLUDES } from '../utils/copy.js';

export async function buildCommand(opts: { target?: string; force?: boolean }): Promise<void> {
  const workspaceDir = process.cwd();
  if (!(await isWorkspace(workspaceDir))) {
    console.log(chalk.red(`✗ Not a polyskill workspace. Run ${chalk.cyan('polyskill init <name>')} first.`));
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
  const { ir, warnings: parseWarnings } = await portable.parse(workspaceDir);

  if (!ir.identity.name || !ir.identity.description.full) {
    console.log(chalk.red('✗ definition.md is incomplete — name and description are required.'));
    process.exitCode = 1;
    return;
  }

  const targetsToBuild = opts.target
    ? config.targets.filter((t) => t.adapter === opts.target)
    : config.targets;

  if (targetsToBuild.length === 0) {
    const known = config.targets.map((t) => t.adapter).join(', ');
    console.log(chalk.red(`✗ No matching target. Configured targets: ${known}`));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold(`Building ${ir.identity.name}`));
  if (parseWarnings.length > 0) {
    for (const w of parseWarnings) console.log(`  ${chalk.yellow('!')} ${w}`);
  }

  const state = await readState(workspaceDir);
  const newFiles: Record<string, string> = {};
  let hadError = false;

  for (const target of targetsToBuild) {
    const adapter = getAdapter(target.adapter);
    const destDir = path.resolve(workspaceDir, target.path);

    // Drift check against last build hashes.
    if (!opts.force && !target.force) {
      const drift = await checkTargetDrift(workspaceDir, adapter, ir, destDir, state);
      if (drift.length > 0) {
        console.log('');
        console.log(chalk.red(`✗ ${adapter.label} drift detected — files modified since last build:`));
        for (const f of drift) console.log(`    ${f}`);
        console.log(chalk.yellow(`  Re-run with ${chalk.cyan('--force')} to overwrite, or ${chalk.cyan('polyskill reconcile')} to inspect.`));
        hadError = true;
        continue;
      }
    }

    // Validate.
    const validation = adapter.validate(ir);
    if (!validation.ok) {
      console.log('');
      console.log(chalk.red(`✗ ${adapter.label} validation failed:`));
      for (const issue of validation.issues) {
        const tag = issue.severity === 'error' ? chalk.red('✗') : chalk.yellow('!');
        console.log(`    ${tag} ${issue.field}: ${issue.message}`);
      }
      hadError = true;
      continue;
    }

    // Emit the SKILL.md (and any per-runtime sidecar).
    const result = await adapter.emit(ir, destDir);

    // Copy supporting files (scripts/, references/, assets/, README.md, etc.)
    // from workspace root into the target's <skill-name>/ directory.
    const skillOutDir = path.join(destDir, ir.identity.name);
    const carry = await copyTreeExcept(workspaceDir, skillOutDir, BUILD_EXCLUDES);
    const carriedFiles = carry.copied.length > 0 ? await trackCarried(skillOutDir, carry.copied) : [];

    console.log('');
    console.log(chalk.green(`✓ ${adapter.label}`));
    for (const f of result.files) {
      const rel = path.relative(workspaceDir, f.path);
      console.log(`    ${chalk.dim('wrote:')} ${rel} ${chalk.dim(`(${f.bytes}b)`)}`);
      newFiles[rel] = f.hash;
    }
    if (carriedFiles.length > 0) {
      console.log(`    ${chalk.dim('carry:')} ${carry.copied.join(', ')} ${chalk.dim(`(${carriedFiles.length} files)`)}`);
      for (const cf of carriedFiles) {
        newFiles[cf.relPath] = cf.hash;
      }
    }
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(`    ${chalk.yellow('!')} ${w}`);
      }
    }
    // Warnings/info from validation are non-blocking; surface them too.
    for (const issue of validation.issues.filter((i) => i.severity !== 'error')) {
      console.log(`    ${chalk.yellow('!')} ${issue.field}: ${issue.message}`);
    }
  }

  if (!hadError) {
    await writeState(workspaceDir, {
      files: { ...state.files, ...newFiles },
      built_at: new Date().toISOString(),
    });
    console.log('');
    console.log(chalk.green.bold(`✓ Build complete (${Object.keys(newFiles).length} files)`));
  } else {
    process.exitCode = 1;
  }
}

async function trackCarried(
  baseDir: string,
  topLevelEntries: string[]
): Promise<{ relPath: string; hash: string }[]> {
  const out: { relPath: string; hash: string }[] = [];
  const workspaceRoot = process.cwd();
  for (const entry of topLevelEntries) {
    const entryPath = path.join(baseDir, entry);
    await walkFiles(entryPath, async (filePath) => {
      const content = await fs.readFile(filePath);
      out.push({
        relPath: path.relative(workspaceRoot, filePath),
        hash: hashString(content.toString('utf8')),
      });
    });
  }
  return out;
}

async function walkFiles(dir: string, visit: (p: string) => Promise<void>): Promise<void> {
  if (!(await pathExists(dir))) return;
  const stat = await fs.stat(dir);
  if (stat.isFile()) {
    await visit(dir);
    return;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, visit);
    } else if (entry.isFile()) {
      await visit(full);
    }
  }
}

async function checkTargetDrift(
  workspaceDir: string,
  adapter: ReturnType<typeof getAdapter>,
  ir: ReturnType<typeof getAdapter> extends never ? never : import('../ir.js').SkillIR,
  destDir: string,
  state: import('../workspace.js').BuildState
): Promise<string[]> {
  // We don't know exactly which files an adapter writes without running emit,
  // so we check the previously tracked files that fall under this target's path.
  const drifted: string[] = [];
  const targetRel = path.relative(workspaceDir, destDir);
  for (const [filePath] of Object.entries(state.files)) {
    if (!filePath.startsWith(targetRel)) continue;
    if (!(await pathExists(path.resolve(workspaceDir, filePath)))) continue;
    const status = await detectDrift(workspaceDir, filePath, state);
    if (status === 'drifted') drifted.push(filePath);
  }
  return drifted;
}
