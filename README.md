# polyskill

**Cross-runtime Agent Skills.** Write your skill once in a portable definition format. Polyskill compiles it into a Claude Code variant and an OpenAI Codex variant, each optimized for the target runtime.

Polyskill itself is both a CLI **and** a skill that gets installed into both runtimes. After install, you invoke it with `/polyskill <natural language>` in Claude Code or `$polyskill <natural language>` in Codex — and the polyskill skill drives the CLI behind the scenes.

---

## Two ways to install

### Path A — Drag-and-drop (no CLI required)

The repo ships pre-built `dist/` outputs for the polyskill meta-skill itself.

```bash
# Claude Code
cp -r skill/dist/claude/polyskill ~/.claude/skills/polyskill

# OpenAI Codex
cp -r skill/dist/codex/polyskill ~/.agents/skills/polyskill
```

Claude Code live-reloads — `/polyskill` works immediately. In Codex, open the desktop app, go to Plugins, click refresh.

⚠️ Path A installs the polyskill **skill** but not the polyskill **CLI**. The skill will respond to natural-language requests, but if it needs to actually run `polyskill build` or `polyskill install` behind the scenes, the CLI also needs to be on PATH — see Path B Step 1.

### Path B — Source + CLI (for builders)

```bash
git clone https://github.com/earlyaidopters/polyskill
cd polyskill
npm install
npm run build
npm link
```

Verify:

```bash
polyskill --version
polyskill detect    # confirms both Claude Code and Codex are seen
```

Then install polyskill itself into both runtimes from the meta-skill workspace:

```bash
cd skill
polyskill install
```

---

## What it solves

The Agent Skills standard ([agentskills.io](https://agentskills.io)) is implemented by 40+ tools. The portable core both Claude Code and Codex actually agree on is exactly four things: the `SKILL.md` filename, the `name` and `description` frontmatter fields, the markdown body, and the `scripts/` / `references/` / `assets/` directory convention.

Everything else is runtime-specific. Claude Code has dynamic injection (the backtick-bang syntax that runs a shell command before reading the skill). Codex has a hidden description-length cap and a separate `agents/openai.yaml` sidecar for UI metadata and MCP server dependencies. Both honor different field-name conventions in the frontmatter.

Polyskill is the seam. Write the portable core once. Get a runtime-optimized output for each target, two-way.

---

## CLI surface

```bash
polyskill init <name>                   # bootstrap a new portable skill workspace
polyskill import <path> --from claude   # import an existing Claude Code skill
polyskill import <path> --from codex    # import an existing Codex skill
polyskill build                         # emit to all configured targets
polyskill install                       # build + copy into ~/.claude/skills + ~/.agents/skills
polyskill detect                        # show which runtimes are installed on this machine
polyskill status                        # which targets are in sync with the last build
polyskill validate                      # lint the definition against each target's rules
polyskill reconcile                     # explain how to resolve drifted target files
polyskill adapters                      # list installed runtime adapters
```

---

## Quick start (authoring your own portable skill)

```bash
polyskill init my-skill
cd my-skill
# edit definition.md
polyskill build
```

Result: `dist/claude/my-skill/SKILL.md` and `dist/codex/my-skill/SKILL.md` (plus `dist/codex/my-skill/agents/openai.yaml` if you declared branding or MCP deps).

When you're ready to install:

```bash
polyskill install
```

That copies the right version into `~/.claude/skills/my-skill/` and `~/.agents/skills/my-skill/` for both runtimes to pick up.

---

## Round-trip example

```bash
# Start from an existing Claude Code skill.
polyskill import ~/.claude/skills/some-skill --from claude

# You now have a portable workspace. Build for both targets.
cd some-skill
polyskill build

# Validate per-target rules.
polyskill validate
```

Going the other direction (Codex → portable → Claude) works the same way with `--from codex`. Supporting files (`scripts/`, `references/`, `assets/`) carry through both ways.

---

## What each adapter does

| Adapter | Reads / writes | Notable transforms |
|---|---|---|
| **portable** | `definition.md` — YAML frontmatter + markdown body | The canonical source. Round-trip target. |
| **claude** | `SKILL.md` with `allowed-tools`, `disable-model-invocation`, etc. | Preserves dynamic injection (the backtick-bang syntax). |
| **codex** | `SKILL.md` + `agents/openai.yaml` sidecar | Front-loads the description for the ~8K catalog cap. Rewrites dynamic injection as fallback prose. Maps MCP deps into the sidecar. Emits the openai.yaml manifest. |

---

## Adding a new runtime

Adding support for a new tool (Gemini CLI, Cursor, Copilot, JetBrains, etc.) is one file.

1. Drop `src/adapters/<name>.ts` implementing the `Adapter` interface (`parse`, `emit`, `validate`).
2. Add one line to `src/adapters/index.ts`: `register(new YourAdapter());`
3. Done. CLI, validator, builder, and reconciler all consume your adapter through the registry.

See `src/adapters/codex.ts` for a worked example.

---

## Drift policy

By default, `polyskill build` hashes every output file. If a target file was hand-edited externally between builds, the build aborts and asks you to either run with `--force` or use `polyskill reconcile` to inspect the drift.

This protects hand-tuned target files from getting silently overwritten.

---

## Worked example

`examples/hello-skill/` is a worked example that exercises every cross-runtime primitive (dynamic injection, MCP dependencies, bash patterns, front-loaded descriptions). The `dist/` folder is committed so you can see what polyskill produces from a source definition without running anything.

---

## Community

The patterns behind polyskill, regular updates as new runtimes get adapters, and a working group of builders shipping their own cross-runtime tools all live in the Early AI Dopters community.

https://www.skool.com/earlyaidopters/about

---

## License

MIT. Open source. Contributions welcome.
