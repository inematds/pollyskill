import type { SkillIR, Provenance } from '../ir.js';

/**
 * Adapter contract — every runtime (Claude Code, Codex, Gemini, ...)
 * implements this once. Adding a new runtime = one new file in
 * `src/adapters/` plus a register() call in `src/adapters/index.ts`.
 */
export interface Adapter {
  /** Unique adapter name, e.g. "claude", "codex", "portable". */
  readonly name: string;

  /** Human-readable label for CLI output. */
  readonly label: string;

  /**
   * Default emit location relative to the consumer's project root.
   * Used by `init` to seed config.
   */
  readonly defaultEmitPath: string;

  /**
   * Parse runtime-specific files into IR.
   * @param sourceDir directory containing the skill files
   */
  parse(sourceDir: string): Promise<ParseResult>;

  /**
   * Emit IR back out to runtime-specific files.
   * @param ir the source-of-truth representation
   * @param destDir where to write
   */
  emit(ir: SkillIR, destDir: string): Promise<EmitResult>;

  /**
   * Lint the IR against this adapter's constraints.
   * E.g. Codex flags descriptions > 8K-cap-safe length.
   */
  validate(ir: SkillIR): ValidationResult;
}

export interface ParseResult {
  ir: SkillIR;
  provenance: Provenance;
  warnings: string[];
}

export interface EmitResult {
  files: WrittenFile[];
  warnings: string[];
}

export interface WrittenFile {
  path: string;
  bytes: number;
  /** Hash of file content. Used for drift detection. */
  hash: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}
