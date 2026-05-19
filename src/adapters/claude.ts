/**
 * Claude Code adapter.
 *
 * Format: a single SKILL.md file with YAML frontmatter.
 *   - Required: name, description
 *   - Honors: allowed-tools, disable-model-invocation, user-invocable, context (fork)
 *   - Body may contain dynamic injections: !`command`
 *
 * Default location: .claude/skills/<name>/SKILL.md
 */

import path from 'node:path';
import matter from 'gray-matter';
import { dump as yamlDump } from 'js-yaml';
import type { Adapter, ParseResult, EmitResult, ValidationResult } from './adapter.js';
import type { SkillIR, DynamicInjection } from '../ir.js';
import { emptyIR, defaultConstraints } from '../ir.js';
import { readFileIfExists, writeFile } from '../utils/fs.js';

const DYNAMIC_INJECTION_PATTERN = /!`([^`]+)`/g;

export class ClaudeAdapter implements Adapter {
  readonly name = 'claude';
  readonly label = 'Claude Code';
  readonly defaultEmitPath = '.claude/skills';

  async parse(sourceDir: string): Promise<ParseResult> {
    const skillPath = path.join(sourceDir, 'SKILL.md');
    const raw = await readFileIfExists(skillPath);
    const warnings: string[] = [];

    if (!raw) {
      warnings.push(`No SKILL.md found at ${skillPath}`);
      return { ir: emptyIR(path.basename(sourceDir)), provenance: {}, warnings };
    }

    const { data: fm, content: body } = matter(raw);
    const skillName = (fm.name as string) ?? path.basename(sourceDir);

    // Normalize hyphen/underscore variants. Spec uses hyphens; underscore
    // forms are common in the wild, so accept both but warn.
    const allowedToolsRaw = pickWithWarn(fm, 'allowed-tools', 'allowed_tools', warnings);
    const userInvocableRaw = pickWithWarn(fm, 'user-invocable', 'user_invocable', warnings);
    const disableModelRaw = pickWithWarn(
      fm,
      'disable-model-invocation',
      'disable_model_invocation',
      warnings
    );

    // Parse allowed-tools (space-separated string OR array).
    const bashPatterns = parseAllowedTools(allowedToolsRaw);

    // Extract dynamic injections from body.
    const { cleanBody, injections } = extractDynamicInjections(body);
    if (injections.length > 0) {
      warnings.push(
        `Found ${injections.length} dynamic injection(s). These are Claude-only; codex_fallback prose will be auto-generated.`
      );
    }

    const ir: SkillIR = {
      identity: {
        name: skillName,
        description: { full: (fm.description as string) ?? '' },
      },
      activation: {
        triggers: [],
        auto_invoke: !(disableModelRaw === true),
        user_invoke: !(userInvocableRaw === false),
        context_isolation: fm.context === 'fork',
      },
      dependencies: {
        mcp: [],
        bash: bashPatterns,
        env: [],
      },
      resources: { scripts: [], references: [], assets: [] },
      behavior: {
        body: cleanBody.trim(),
        dynamic_injections: injections,
      },
      constraints: defaultConstraints(),
    };

    return { ir, provenance: {}, warnings };
  }

  async emit(ir: SkillIR, destDir: string): Promise<EmitResult> {
    const skillDir = path.join(destDir, ir.identity.name);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const warnings: string[] = [];

    const fm: Record<string, unknown> = {
      name: ir.identity.name,
      description: ir.identity.description.full,
    };

    if (ir.dependencies.bash.length > 0) {
      fm['allowed-tools'] = ir.dependencies.bash.map((b) => b.pattern).join(' ');
    }
    if (ir.activation.auto_invoke === false) {
      fm['disable-model-invocation'] = true;
    }
    if (ir.activation.user_invoke === false) {
      fm['user-invocable'] = false;
    }
    if (ir.activation.context_isolation) {
      fm.context = 'fork';
    }

    // Reconstruct body with dynamic injections inlined.
    const body = restoreDynamicInjections(ir.behavior.body, ir.behavior.dynamic_injections);

    if (ir.dependencies.mcp.length > 0) {
      warnings.push(
        `MCP dependencies (${ir.dependencies.mcp.length}) noted in body — Claude Code doesn't consume MCP from frontmatter.`
      );
    }

    const content = `---\n${yamlDump(fm, { lineWidth: 200, noRefs: true })}---\n\n${appendMcpNote(body, ir)}\n`;
    const { bytes, hash } = await writeFile(skillPath, content);

    return { files: [{ path: skillPath, bytes, hash }], warnings };
  }

  validate(ir: SkillIR): ValidationResult {
    const issues: ValidationResult['issues'] = [];
    if (!ir.identity.description.full) {
      issues.push({
        severity: 'error',
        field: 'identity.description.full',
        message: 'description.full is required for Claude Code',
      });
    }
    if (ir.behavior.body.split('\n').length > ir.constraints.max_body_lines) {
      issues.push({
        severity: 'warning',
        field: 'behavior.body',
        message: `Body exceeds ${ir.constraints.max_body_lines} lines — Claude Code best-practices recommend splitting into references/`,
      });
    }
    return { ok: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }
}

/**
 * Pick a value from the frontmatter accepting both the spec form (hyphenated)
 * and the underscored variant. Warn if only the non-spec form is used so the
 * author can fix their original file.
 */
function pickWithWarn(
  fm: Record<string, unknown>,
  specKey: string,
  altKey: string,
  warnings: string[]
): unknown {
  const specVal = fm[specKey];
  const altVal = fm[altKey];
  if (specVal !== undefined) return specVal;
  if (altVal !== undefined) {
    warnings.push(
      `Frontmatter uses "${altKey}" (underscore) — the Claude Code spec uses "${specKey}" (hyphen). Polyskill will emit the spec form.`
    );
    return altVal;
  }
  return undefined;
}

function parseAllowedTools(raw: unknown): { pattern: string }[] {
  if (!raw) return [];
  const tokens: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? raw.split(/\s+/).filter(Boolean)
      : [];
  return tokens.map((pattern) => ({ pattern }));
}

function extractDynamicInjections(body: string): { cleanBody: string; injections: DynamicInjection[] } {
  const injections: DynamicInjection[] = [];
  let counter = 0;
  const cleanBody = body.replace(DYNAMIC_INJECTION_PATTERN, (_match, command: string) => {
    counter++;
    const placeholder = `{{injection_${counter}}}`;
    injections.push({
      placeholder,
      command,
      codex_fallback: `First, run \`${command}\` and review the output before continuing.`,
    });
    return placeholder;
  });
  return { cleanBody, injections };
}

function restoreDynamicInjections(body: string, injections: DynamicInjection[]): string {
  let restored = body;
  for (const inj of injections) {
    restored = restored.split(inj.placeholder).join(`!\`${inj.command}\``);
  }
  return restored;
}

function appendMcpNote(body: string, ir: SkillIR): string {
  if (ir.dependencies.mcp.length === 0) return body;
  const lines = ['', '## Required MCP servers', ''];
  for (const m of ir.dependencies.mcp) {
    lines.push(`- **${m.name}** — ${m.description ?? 'no description'} (${m.url})`);
  }
  return body + '\n' + lines.join('\n');
}
