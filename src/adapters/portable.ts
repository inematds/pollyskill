/**
 * Portable adapter — the canonical source-of-truth format.
 *
 * Format: a single `definition.md` file with rich YAML frontmatter
 * containing the full IR, and the markdown body as the file body.
 *
 * This is the file authors edit. Every other adapter parses INTO this
 * shape and emits OUT of it.
 */

import path from 'node:path';
import matter from 'gray-matter';
import { dump as yamlDump } from 'js-yaml';
import type { Adapter, ParseResult, EmitResult, ValidationResult } from './adapter.js';
import type { SkillIR } from '../ir.js';
import { emptyIR, defaultConstraints } from '../ir.js';
import { readFileIfExists, writeFile } from '../utils/fs.js';

export class PortableAdapter implements Adapter {
  readonly name = 'portable';
  readonly label = 'Portable (canonical)';
  readonly defaultEmitPath = '.';

  async parse(sourceDir: string): Promise<ParseResult> {
    const defPath = path.join(sourceDir, 'definition.md');
    const raw = await readFileIfExists(defPath);
    const warnings: string[] = [];

    if (!raw) {
      warnings.push(`No definition.md found at ${defPath}`);
      return {
        ir: emptyIR(path.basename(sourceDir)),
        provenance: {},
        warnings,
      };
    }

    const parsed = matter(raw);
    const fm = parsed.data as Partial<SkillIR>;

    const ir: SkillIR = {
      identity: {
        name: fm.identity?.name ?? path.basename(sourceDir),
        description: {
          full: fm.identity?.description?.full ?? '',
          front_loaded: fm.identity?.description?.front_loaded,
          short: fm.identity?.description?.short,
        },
        license: fm.identity?.license,
        brand_color: fm.identity?.brand_color,
        icons: fm.identity?.icons,
      },
      activation: {
        triggers: fm.activation?.triggers ?? [],
        auto_invoke: fm.activation?.auto_invoke ?? true,
        user_invoke: fm.activation?.user_invoke ?? true,
        context_isolation: fm.activation?.context_isolation,
      },
      dependencies: {
        mcp: fm.dependencies?.mcp ?? [],
        bash: fm.dependencies?.bash ?? [],
        env: fm.dependencies?.env ?? [],
      },
      resources: {
        scripts: fm.resources?.scripts ?? [],
        references: fm.resources?.references ?? [],
        assets: fm.resources?.assets ?? [],
      },
      behavior: {
        body: parsed.content.trim(),
        dynamic_injections: fm.behavior?.dynamic_injections ?? [],
      },
      constraints: fm.constraints ?? defaultConstraints(),
    };

    const provenance = mapProvenance(ir, 'portable');

    return { ir, provenance, warnings };
  }

  async emit(ir: SkillIR, destDir: string): Promise<EmitResult> {
    const defPath = path.join(destDir, 'definition.md');

    // Frontmatter is everything except behavior.body (which goes in the markdown content).
    const fmObj = {
      identity: ir.identity,
      activation: ir.activation,
      dependencies: ir.dependencies,
      resources: ir.resources,
      behavior: {
        dynamic_injections: ir.behavior.dynamic_injections,
      },
      constraints: ir.constraints,
    };

    const content = `---\n${yamlDump(fmObj, { lineWidth: 100, noRefs: true })}---\n\n${ir.behavior.body}\n`;
    const { bytes, hash } = await writeFile(defPath, content);

    return {
      files: [{ path: defPath, bytes, hash }],
      warnings: [],
    };
  }

  validate(ir: SkillIR): ValidationResult {
    const issues: ValidationResult['issues'] = [];
    if (!ir.identity.name) {
      issues.push({ severity: 'error', field: 'identity.name', message: 'name is required' });
    }
    if (!/^[a-z][a-z0-9-]*$/.test(ir.identity.name)) {
      issues.push({
        severity: 'error',
        field: 'identity.name',
        message: 'name must be lowercase a-z + hyphens',
      });
    }
    if (!ir.identity.description.full) {
      issues.push({
        severity: 'error',
        field: 'identity.description.full',
        message: 'description.full is required',
      });
    }
    return { ok: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }
}

function mapProvenance(ir: SkillIR, source: string): Record<string, { source: string; confidence: number }> {
  // Shallow provenance — every direct-from-portable value gets confidence 1.0.
  const map: Record<string, { source: string; confidence: number }> = {};
  const stamp = (path: string) => (map[path] = { source, confidence: 1.0 });

  stamp('identity.name');
  stamp('identity.description.full');
  if (ir.identity.description.front_loaded) stamp('identity.description.front_loaded');
  if (ir.identity.description.short) stamp('identity.description.short');
  stamp('activation.triggers');
  stamp('dependencies.mcp');
  stamp('dependencies.bash');
  stamp('behavior.body');

  return map;
}
