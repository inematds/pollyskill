/**
 * Recursive directory copy with an exclusion list.
 *
 * Used to carry supporting files (scripts/, references/, assets/, README.md,
 * etc.) through both the import path (runtime skill → workspace) and the
 * build path (workspace → emitted target).
 *
 * Exclusion matches against the top-level entry NAME only (e.g. "agents",
 * "SKILL.md", ".git"). Nested paths inside copied directories are not
 * filtered — once a subtree is copied, the whole tree comes through.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, pathExists } from './fs.js';

export interface CopyResult {
  copied: string[];
  skipped: string[];
}

export async function copyTreeExcept(
  src: string,
  dst: string,
  exclude: Set<string>
): Promise<CopyResult> {
  const result: CopyResult = { copied: [], skipped: [] };
  if (!(await pathExists(src))) return result;

  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.has(entry.name)) {
      result.skipped.push(entry.name);
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    if (entry.isDirectory()) {
      await ensureDir(dstPath);
      await fs.cp(srcPath, dstPath, { recursive: true });
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(dstPath));
      await fs.copyFile(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
      // Resolve the symlink and copy its target so the emitted skill is
      // self-contained (recipients of the skill won't have the same link).
      const realPath = await fs.realpath(srcPath);
      const stat = await fs.stat(realPath);
      if (stat.isDirectory()) {
        await ensureDir(dstPath);
        await fs.cp(realPath, dstPath, { recursive: true });
      } else {
        await ensureDir(path.dirname(dstPath));
        await fs.copyFile(realPath, dstPath);
      }
    } else {
      continue;
    }
    result.copied.push(entry.name);
  }
  return result;
}

/** Files/dirs always excluded when importing a runtime skill → workspace. */
export const IMPORT_EXCLUDES = new Set([
  'SKILL.md', // body+frontmatter goes into definition.md
  'agents', // Codex runtime-specific manifest directory
  '.DS_Store',
  '.git',
  'node_modules',
]);

/** Files/dirs always excluded when building workspace → emitted target. */
export const BUILD_EXCLUDES = new Set([
  'definition.md', // becomes SKILL.md per target
  'polyskill.yaml', // workspace config, not part of the skill
  '.polyskill', // workspace state
  'dist', // build output
  '.DS_Store',
  '.git',
  'node_modules',
]);
