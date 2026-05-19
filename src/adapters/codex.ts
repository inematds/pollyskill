/**
 * Codex adapter.
 *
 * Format: a directory with:
 *   - SKILL.md (name + description frontmatter, plus optional metadata.short-description)
 *   - agents/openai.yaml (UI metadata + MCP dependencies, optional)
 *
 * Catalog constraints: ~8K char cap across all skills' names + descriptions + paths.
 * Authors should front-load trigger words in descriptions.
 *
 * Default location: .agents/skills/<name>/
 */

import path from 'node:path';
import matter from 'gray-matter';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import type { Adapter, ParseResult, EmitResult, ValidationResult } from './adapter.js';
import type { SkillIR } from '../ir.js';
import { emptyIR, defaultConstraints } from '../ir.js';
import { readFileIfExists, writeFile } from '../utils/fs.js';
import { frontLoad, shortLabel } from '../utils/descriptions.js';

const CODEX_CATALOG_BUDGET = 250; // soft per-skill cap so the global 8K stays headroomed

export class CodexAdapter implements Adapter {
  readonly name = 'codex';
  readonly label = 'OpenAI Codex';
  readonly defaultEmitPath = '.agents/skills';

  async parse(sourceDir: string): Promise<ParseResult> {
    const skillPath = path.join(sourceDir, 'SKILL.md');
    const yamlPath = path.join(sourceDir, 'agents', 'openai.yaml');
    const skillRaw = await readFileIfExists(skillPath);
    const yamlRaw = await readFileIfExists(yamlPath);
    const warnings: string[] = [];

    if (!skillRaw) {
      warnings.push(`No SKILL.md found at ${skillPath}`);
      return { ir: emptyIR(path.basename(sourceDir)), provenance: {}, warnings };
    }

    const { data: fm, content: body } = matter(skillRaw);
    const skillName = (fm.name as string) ?? path.basename(sourceDir);

    let openaiYaml: Record<string, any> = {};
    if (yamlRaw) {
      try {
        openaiYaml = (yamlLoad(yamlRaw) as Record<string, any>) ?? {};
      } catch (err) {
        warnings.push(`Failed to parse openai.yaml: ${(err as Error).message}`);
      }
    }

    const mcpDeps = Array.isArray(openaiYaml?.dependencies?.tools)
      ? openaiYaml.dependencies.tools
          .filter((t: any) => t?.type === 'mcp')
          .map((t: any) => ({
            name: t.value,
            description: t.description,
            url: t.url,
            transport: t.transport,
          }))
      : [];

    const ir: SkillIR = {
      identity: {
        name: skillName,
        description: {
          // Codex description is the front-loaded version. We promote it to `full`
          // when no other source is available, and keep it as `front_loaded`.
          full: (fm.description as string) ?? '',
          front_loaded: (fm.description as string) ?? undefined,
          short: (fm.metadata?.['short-description'] as string) ?? openaiYaml?.interface?.short_description,
        },
        brand_color: openaiYaml?.interface?.brand_color,
        icons: {
          small: openaiYaml?.interface?.icon_small,
          large: openaiYaml?.interface?.icon_large,
        },
      },
      activation: {
        triggers: [],
        auto_invoke: openaiYaml?.policy?.allow_implicit_invocation !== false,
        user_invoke: true,
      },
      dependencies: { mcp: mcpDeps, bash: [], env: [] },
      resources: { scripts: [], references: [], assets: [] },
      behavior: { body: body.trim(), dynamic_injections: [] },
      constraints: defaultConstraints(),
    };

    return { ir, provenance: {}, warnings };
  }

  async emit(ir: SkillIR, destDir: string): Promise<EmitResult> {
    const skillDir = path.join(destDir, ir.identity.name);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const yamlPath = path.join(skillDir, 'agents', 'openai.yaml');
    const warnings: string[] = [];

    const frontLoaded = frontLoad(
      ir.identity.description.full,
      ir.identity.description.front_loaded,
      ir.activation.triggers
    );
    const short = shortLabel(ir.identity.description.full, ir.identity.description.short);

    if (frontLoaded.length > CODEX_CATALOG_BUDGET) {
      warnings.push(
        `Front-loaded description is ${frontLoaded.length} chars — recommend keeping under ${CODEX_CATALOG_BUDGET} to stay safe against Codex's 8K catalog cap.`
      );
    }

    const fm: Record<string, unknown> = {
      name: ir.identity.name,
      description: frontLoaded,
    };
    if (short) {
      fm.metadata = { 'short-description': short };
    }

    // Rewrite dynamic-injection placeholders as fallback prose.
    let body = ir.behavior.body;
    for (const inj of ir.behavior.dynamic_injections) {
      const fallback = inj.codex_fallback ?? `First, run \`${inj.command}\` and review the output before continuing.`;
      body = body.split(inj.placeholder).join(fallback);
    }

    // Append bash sandbox guidance if applicable.
    if (ir.dependencies.bash.length > 0) {
      const lines = ['', '## Sandbox guidance', ''];
      lines.push('This skill may need to run the following commands. If the Codex sandbox blocks them, rerun with `sandbox_permissions=require_escalated`:');
      lines.push('');
      for (const b of ir.dependencies.bash) {
        lines.push(`- \`${b.pattern}\`${b.reason ? ` — ${b.reason}` : ''}`);
      }
      body += '\n' + lines.join('\n');
    }

    const skillContent = `---\n${yamlDump(fm, { lineWidth: 200, noRefs: true })}---\n\n${body}\n`;
    const skillResult = await writeFile(skillPath, skillContent);

    const files = [{ path: skillPath, bytes: skillResult.bytes, hash: skillResult.hash }];

    // Emit openai.yaml only if we have something to put in it.
    const openaiYaml = buildOpenaiYaml(ir, short);
    if (openaiYaml) {
      const yamlContent = yamlDump(openaiYaml, { lineWidth: 200, noRefs: true });
      const yamlResult = await writeFile(yamlPath, yamlContent);
      files.push({ path: yamlPath, bytes: yamlResult.bytes, hash: yamlResult.hash });
    }

    return { files, warnings };
  }

  validate(ir: SkillIR): ValidationResult {
    const issues: ValidationResult['issues'] = [];
    if (!ir.identity.description.full) {
      issues.push({
        severity: 'error',
        field: 'identity.description.full',
        message: 'description.full is required for Codex',
      });
    }
    const frontLoaded = frontLoad(
      ir.identity.description.full,
      ir.identity.description.front_loaded,
      ir.activation.triggers
    );
    if (frontLoaded.length > CODEX_CATALOG_BUDGET) {
      issues.push({
        severity: 'warning',
        field: 'identity.description.front_loaded',
        message: `Codex description is ${frontLoaded.length} chars; recommend < ${CODEX_CATALOG_BUDGET}`,
      });
    }
    if (ir.behavior.dynamic_injections.length > 0) {
      issues.push({
        severity: 'info',
        field: 'behavior.dynamic_injections',
        message: `${ir.behavior.dynamic_injections.length} dynamic injection(s) will be rewritten as fallback prose for Codex`,
      });
    }
    return { ok: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }
}

function buildOpenaiYaml(ir: SkillIR, short: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const iface: Record<string, unknown> = {};

  if (short) iface.short_description = short;
  if (ir.identity.brand_color) iface.brand_color = ir.identity.brand_color;
  if (ir.identity.icons?.small) iface.icon_small = ir.identity.icons.small;
  if (ir.identity.icons?.large) iface.icon_large = ir.identity.icons.large;
  iface.default_prompt = `Use $${ir.identity.name} to ...`;

  if (Object.keys(iface).length > 1) {
    out.interface = iface;
  }

  if (ir.dependencies.mcp.length > 0) {
    out.dependencies = {
      tools: ir.dependencies.mcp.map((m) => ({
        type: 'mcp',
        value: m.name,
        description: m.description,
        transport: m.transport ?? 'streamable_http',
        url: m.url,
      })),
    };
  }

  if (ir.activation.auto_invoke === false) {
    out.policy = { allow_implicit_invocation: false };
  }

  return Object.keys(out).length > 0 ? out : null;
}
