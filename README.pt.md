# polyskill

[![License: MIT](https://img.shields.io/badge/License-MIT-coral.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Agent Skills Standard](https://img.shields.io/badge/Agent_Skills-spec_compliant-success.svg)](https://agentskills.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contribuindo)

> **Agent Skills multi-runtime.** Escreva sua skill uma vez num formato portátil. O polyskill compila pra variantes do Claude Code e do OpenAI Codex, cada uma otimizada pro runtime alvo.

> 🇬🇧 English version: [README.md](README.md)

![Uma fonte, todos os runtimes](docs/images/hero-one-source-every-runtime.jpg)

Depois de instalar, você invoca o polyskill com `/polyskill <linguagem natural>` no Claude Code ou `$polyskill <linguagem natural>` no Codex. A skill dirige o CLI por baixo — você nunca precisa decorar comando.

---

## Sumário

- [Por que existe](#por-que-existe)
- [Instalação (dois caminhos)](#instalação-dois-caminhos)
- [Início rápido](#início-rápido)
- [Como funciona](#como-funciona)
- [Referência do CLI](#referência-do-cli)
- [Exemplo prático](#exemplo-prático)
- [Política de drift](#política-de-drift)
- [Roadmap](#roadmap)
- [Contribuindo](#contribuindo)
- [Comunidade](#comunidade)
- [Licença](#licença)

---

## Por que existe

O padrão Agent Skills ([agentskills.io](https://agentskills.io)) já é implementado por mais de 40 ferramentas. O núcleo portátil que Claude Code e OpenAI Codex realmente concordam é exatamente quatro coisas.

1. O nome de arquivo `SKILL.md`
2. Os campos `name` e `description` do frontmatter
3. O corpo em markdown
4. A convenção de diretórios `scripts/` / `references/` / `assets/`

Todo o resto é específico do runtime. O Claude Code tem injeção dinâmica (sintaxe crase-bang que executa um comando shell antes de ler a skill). O Codex tem um limite oculto de tamanho da descrição e um sidecar `agents/openai.yaml` separado pra metadados de UI e dependências de MCP server. Os dois respeitam convenções de nome diferentes no frontmatter.

Polyskill é a costura. Escreve o núcleo portátil uma vez. Recebe um output otimizado pra cada alvo, nos dois sentidos.

---

## Instalação (dois caminhos)

### Caminho A. Arrastar e soltar (sem CLI)

O repo já inclui os outputs `dist/` pré-buildados da própria meta-skill do polyskill. Copia direto pros diretórios de skills.

```bash
# Claude Code
cp -r skill/dist/claude/polyskill ~/.claude/skills/polyskill

# OpenAI Codex
cp -r skill/dist/codex/polyskill ~/.agents/skills/polyskill
```

Claude Code dá reload automático, então `/polyskill` já funciona. No Codex: abre o app desktop → Plugins → refresh.

> ⚠️ O Caminho A instala a **skill** do polyskill, mas não o **CLI**. A skill responde a pedidos em linguagem natural, mas se ela precisar rodar `polyskill build` ou `polyskill install` por baixo, o CLI também precisa estar no PATH. Veja o Caminho B.

### Caminho B. Fonte + CLI (pra quem constrói)

```bash
git clone https://github.com/inematds/pollyskill
cd pollyskill
npm install
npm run build
npm link
```

Confirma que o CLI está acessível.

```bash
polyskill --version
polyskill detect    # confirma que Claude Code e Codex foram detectados
```

Instala o próprio polyskill nos dois runtimes a partir do workspace da meta-skill.

```bash
cd skill
polyskill install
```

Saída esperada.

```
✓ Claude Code     → ~/.claude/skills/polyskill
✓ OpenAI Codex    → ~/.agents/skills/polyskill
```

---

## Início rápido

Depois de instalar, você chama o polyskill em linguagem natural em qualquer um dos runtimes.

```
/polyskill converte minha skill y-compare pra funcionar nos dois runtimes
$polyskill converte minha skill y-compare pra funcionar nos dois runtimes
```

A skill do polyskill pega o pedido, roda os comandos certos do CLI e te devolve o resultado. Sem decorar flag.

Se preferir dirigir o CLI direto, veja a [Referência do CLI](#referência-do-cli) abaixo.

---

## Como funciona

![Arquitetura do polyskill](docs/images/architecture-adapters.jpg)

Polyskill tem três peças.

1. **A estrutura compartilhada (Representação Interna).** Uma versão neutra de tudo que uma skill precisa ser, sem amarração a nenhuma ferramenta específica.
2. **Os adapters.** Um arquivo por runtime. Cada adapter sabe ler E escrever o formato daquele runtime. Pluga um adapter → a ferramenta passa a ser suportada. Remove → some.
3. **O CLI.** O que você executa de fato no terminal. Orquestra os adapters.

Adicionar uma ferramenta nova é literalmente um arquivo. Você escreve o adapter, registra, e CLI / validator / builder / reconciler pegam automaticamente via registry.

Veja `src/adapters/codex.ts` pra um exemplo completo.

---

## Referência do CLI

```bash
polyskill init <nome>                   # cria um workspace de skill portátil
polyskill import <path> --from claude   # importa uma skill existente do Claude Code
polyskill import <path> --from codex    # importa uma skill existente do Codex
polyskill build                         # emite pra todos os alvos configurados
polyskill install                       # build + copia pra ~/.claude/skills + ~/.agents/skills
polyskill detect                        # mostra quais runtimes estão instalados na máquina
polyskill status                        # quais alvos estão em sync com o último build
polyskill validate                      # lint da definição contra as regras de cada alvo
polyskill reconcile                     # explica como resolver arquivos de alvo que drift-aram
polyskill adapters                      # lista os adapters de runtime instalados
```

### O que cada adapter faz

| Adapter | Lê e escreve | Transformações notáveis |
|---|---|---|
| **portable** | `definition.md` (frontmatter YAML + corpo markdown) | A fonte canônica. Alvo de round-trip. |
| **claude** | `SKILL.md` com `allowed-tools`, `disable-model-invocation`, etc. | Preserva injeção dinâmica (sintaxe crase-bang). |
| **codex** | `SKILL.md` + sidecar `agents/openai.yaml` | Antecipa a descrição pro limite de ~8K do catálogo. Reescreve injeção dinâmica como prosa de fallback. Mapeia deps de MCP pro sidecar. Emite o manifesto `openai.yaml`. |

---

## Exemplo prático

`examples/hello-skill/` exercita todas as primitivas cross-runtime (injeção dinâmica, dependências MCP, padrões bash, descrições antecipadas). A pasta `dist/` está commitada pra você ver o que o polyskill produz a partir de uma definição source sem precisar rodar nada.

### Autorando sua própria skill portátil

```bash
polyskill init minha-skill
cd minha-skill
# edita definition.md
polyskill build
```

Resultado. `dist/claude/minha-skill/SKILL.md` e `dist/codex/minha-skill/SKILL.md` (mais `dist/codex/minha-skill/agents/openai.yaml` se você declarar branding ou deps MCP).

Quando estiver pronto pra instalar em tudo.

```bash
polyskill install
```

### Exemplo de round-trip

![Bidirecional](docs/images/roundtrip.jpg)

```bash
# Começa a partir de uma skill existente do Claude Code.
polyskill import ~/.claude/skills/alguma-skill --from claude

# Agora você tem um workspace portátil. Builda pros dois alvos.
cd alguma-skill
polyskill build

# Valida regras por alvo.
polyskill validate
```

No sentido contrário (Codex → Claude Code) funciona igual, com `--from codex`. Arquivos de suporte (`scripts/`, `references/`, `assets/`) atravessam nos dois sentidos.

---

## Política de drift

Por padrão, `polyskill build` faz hash de todo arquivo de output. Se um arquivo de alvo foi editado à mão fora do polyskill entre builds, o build aborta e te pede pra rodar de novo com `--force` ou usar `polyskill reconcile` pra inspecionar o drift.

Isso protege arquivos de alvo afinados à mão de serem sobrescritos em silêncio.

---

## Roadmap

Adapters embutidos (hoje):

- ✅ Claude Code
- ✅ OpenAI Codex
- ✅ Portable (o formato source canônico)

Planejados, em ordem de prioridade:

- 🔜 Gemini CLI
- 🔜 Cursor
- 🔜 GitHub Copilot
- 🔜 JetBrains AI Assistant

Quer um runtime adicionado mais cedo? Abre uma issue com link pra documentação do formato de skill do alvo, ou abre um PR com um adapter rascunho. A barra é `parse` + `emit` + algumas regras de validação.

---

## Contribuindo

Pull requests bem-vindos. O caminho mais rápido de contribuição é um adapter novo pra um runtime que já suporta o padrão Agent Skills.

1. Faz fork do repo.
2. Coloca um arquivo novo em `src/adapters/<nome>.ts` implementando a interface `Adapter` (`parse`, `emit`, `validate`).
3. Adiciona uma linha em `src/adapters/index.ts`: `register(new SeuAdapter());`
4. Adiciona um exemplo prático em `examples/<nome>-example/` pra reviewers verificarem o round-trip.
5. Abre o PR. Marca com `new-adapter`.

Pra bug reports, inclua o workspace de skill que reproduz o issue (ou uma versão redatada), mais a saída de `polyskill --version` e `polyskill detect`.

---

## Comunidade

Os padrões por trás do polyskill, atualizações regulares conforme novos runtimes ganham adapters, e um working group de builders shippando suas próprias ferramentas cross-runtime — tudo isso vive na comunidade Early AI Dopters.

https://www.skool.com/earlyaidopters/about

Tem também um vídeo companheiro mostrando a arquitetura e uma demo ao vivo. Deixa comentário se você construir algo interessante em cima disso.

---

## Agradecimentos

Construído sobre o padrão aberto Agent Skills em [agentskills.io](https://agentskills.io), originalmente desenvolvido pela Anthropic e liberado como spec aberta. Polyskill não tem posição sobre qual runtime é melhor — só acha que suas skills não deveriam ter que escolher.

---

## Licença

[MIT](LICENSE). Open source. Contribuições bem-vindas.
