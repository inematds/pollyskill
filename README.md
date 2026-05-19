# polyskill

Universal adapter for [Agent Skills](https://agentskills.io). Write your skill once in a portable definition format — polyskill compiles it into Claude Code and Codex variants, optimized for each runtime.

Adding a new runtime (Gemini CLI, Cursor, Copilot, ...) is one file.

## Why

The Agent Skills format is an open standard implemented by 35+ tools. The portable core both Claude Code and Codex actually accept from the spec is exactly four things: the `SKILL.md` filename, the `name` and `description` frontmatter fields, the markdown body, and the `scripts/` / `references/` / `assets/` directory convention.

Everything else — `agents/openai.yaml`, the 8K Codex catalog cap, `allowed-tools` honoring, dynamic injection (`` !`shell` ``), `disable-model-invocation`, hooks — is a per-runtime extension.

Polyskill is the seam. Author the portable core once, get runtime-optimized output for free, two-way.

## Install

```bash
npm install -g polyskill
```

Or from source:

```bash
git clone https://github.com/earlyaidopters/polyskill
cd polyskill
npm install
npm run build
npm link
```

## The five-command surface

```bash
polyskill init <name>            # bootstrap a new portable skill
polyskill import <path> --from claude   # import an existing Claude Code skill
polyskill import <path> --from codex    # import an existing Codex skill
polyskill build                  # emit to all configured targets
polyskill status                 # which targets are in sync
polyskill validate               # lint per target
polyskill reconcile              # show drifted target files
```

## Quick start

```bash
polyskill init my-skill
cd my-skill
# edit definition.md
polyskill build
```

Result: `dist/claude/my-skill/SKILL.md` and `dist/codex/my-skill/SKILL.md` (plus `dist/codex/my-skill/agents/openai.yaml` if branding/MCP deps are declared).

Point `polyskill.yaml` at `.claude/skills/` and `.agents/skills/` if you want the built skills to land directly in their runtime homes.

## Round-trip example

```bash
# Start from an existing Claude Code skill.
polyskill import ~/.claude/skills/some-skill --from claude

# Now you have a portable workspace. Build for both targets.
cd some-skill
polyskill build

# Validate.
polyskill validate
```

Going the other direction (Codex → portable → Claude) works the same way with `--from codex`.

## What each adapter does

| Adapter | Reads / Writes | Notable transforms |
|---|---|---|
| **portable** | `definition.md` (YAML frontmatter + markdown body) | The canonical source. |
| **claude** | `SKILL.md` with `allowed-tools`, `disable-model-invocation`, etc. | Preserves `` !`shell` `` dynamic injections. |
| **codex** | `SKILL.md` + `agents/openai.yaml` | Front-loads the description for the 8K catalog cap. Rewrites dynamic injections as fallback prose. Maps MCP deps into the sidecar. |

## Adding a new runtime

1. Drop `src/adapters/<name>.ts` implementing the `Adapter` interface.
2. Add one line to `src/adapters/index.ts`: `register(new YourAdapter());`
3. Done. CLI, validator, builder, and reconciler all consume your adapter through the registry.

See `src/adapters/codex.ts` for a worked example.

## Drift policy

By default, `polyskill build` checks every output file's hash against the last build. If a file was hand-edited externally, the build aborts and asks you to either `--force` or `polyskill reconcile`.

This protects hand-tuned target files from getting silently overwritten.

## License

MIT. Open source. Contributions welcome.
