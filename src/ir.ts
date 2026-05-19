/**
 * Internal Representation (IR) — neutral structural model of a skill.
 *
 * Every adapter parses its runtime-specific format INTO this shape,
 * and emits FROM this shape into its runtime-specific format.
 *
 * Adding a new runtime = writing one adapter against this interface.
 */

export interface SkillIR {
  identity: Identity;
  activation: Activation;
  dependencies: Dependencies;
  resources: Resources;
  behavior: Behavior;
  constraints: Constraints;
}

export interface Identity {
  /** Skill name. lowercase a-z + hyphens. Must match directory name. */
  name: string;

  description: {
    /** The long version. Claude Code uses this verbatim. */
    full: string;
    /** Trigger-front-loaded version, ~200 chars, 8K-cap-safe for Codex catalog. */
    front_loaded?: string;
    /** 25-64 char UI display version (Codex sidecar). */
    short?: string;
  };

  /** SPDX-style license string. Optional. */
  license?: string;

  /** Codex UI branding. Optional. */
  brand_color?: string;
  icons?: {
    small?: string;
    large?: string;
  };
}

export interface Activation {
  /**
   * Trigger keywords used to validate descriptions and synthesize
   * front-loaded versions. Pure metadata for the optimizer.
   */
  triggers: string[];

  /** Can the runtime auto-pick this skill from a user prompt? */
  auto_invoke: boolean;

  /** Can the user explicitly invoke this skill? */
  user_invoke: boolean;

  /** Run in isolated subagent context. Claude Code only; ignored elsewhere. */
  context_isolation?: boolean;
}

export interface Dependencies {
  /** MCP server dependencies. Codex consumes natively; Claude treats as docs. */
  mcp: McpDependency[];

  /** Bash/CLI tool patterns. Claude maps to allowed-tools; Codex notes in body. */
  bash: BashPattern[];

  /** Required environment variables. Surfaced in body of every emit. */
  env: EnvVar[];
}

export interface McpDependency {
  name: string;
  description?: string;
  url: string;
  transport?: 'streamable_http' | 'stdio' | 'sse';
}

export interface BashPattern {
  /** A permission rule like "git:*" or "npm install". */
  pattern: string;
  /** Why this tool is needed. Surfaced in body for Codex sandbox guidance. */
  reason?: string;
}

export interface EnvVar {
  name: string;
  description?: string;
  required: boolean;
}

export interface Resources {
  /** Relative paths to executable scripts. */
  scripts: string[];
  /** Relative paths to reference docs (loaded on demand by the model). */
  references: string[];
  /** Relative paths to template/asset files. */
  assets: string[];
}

export interface Behavior {
  /**
   * The markdown body shown to the model when the skill activates.
   * Should NOT include frontmatter — that's per-adapter.
   */
  body: string;

  /**
   * Claude-only dynamic injections of shell command output into the body.
   * When emitting for Codex, these get rewritten using `codex_fallback`.
   */
  dynamic_injections: DynamicInjection[];
}

export interface DynamicInjection {
  /** Token to find in body, e.g. "{{git_diff}}". */
  placeholder: string;
  /** Shell command Claude Code runs before injection. */
  command: string;
  /** Prose instruction emitted to runtimes that don't support injection. */
  codex_fallback?: string;
}

export interface Constraints {
  /** Recommended max body line count. Default 500. */
  max_body_lines: number;
  /** Recommended max body tokens. Default 5000. */
  recommended_body_tokens: number;
}

/**
 * Provenance map: for each leaf path in the IR, where did the value come from?
 * Used by the reconciler when two sources disagree.
 */
export type Provenance = Record<string, ProvenanceEntry>;

export interface ProvenanceEntry {
  /** Adapter name that produced this value. */
  source: string;
  /** 0.0–1.0; lower if the value was inferred/derived. */
  confidence: number;
  /** Optional note explaining the inference. */
  note?: string;
}

/** Default constraints — used when adapters don't override. */
export function defaultConstraints(): Constraints {
  return {
    max_body_lines: 500,
    recommended_body_tokens: 5000,
  };
}

/** Empty IR — useful for `init` scaffolding. */
export function emptyIR(name: string): SkillIR {
  return {
    identity: {
      name,
      description: { full: '' },
    },
    activation: {
      triggers: [],
      auto_invoke: true,
      user_invoke: true,
    },
    dependencies: {
      mcp: [],
      bash: [],
      env: [],
    },
    resources: {
      scripts: [],
      references: [],
      assets: [],
    },
    behavior: {
      body: '',
      dynamic_injections: [],
    },
    constraints: defaultConstraints(),
  };
}
