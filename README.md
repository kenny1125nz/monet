# Monet

A CLI-based AI agent orchestrator that follows the **PDCA loop** (Plan, Do, Check, Act) for AI-assisted software development.

Monet shifts the workflow from "prompting for code" to **architecting for code**. A system is decomposed recursively into self-contained node units, and coding agents implement leaf nodes against explicit contracts.

## Why Monet

- **Complexity control** — recursive decomposition keeps each component small enough to reason about.
- **Human accountability** — structural trade-offs are owned and approved by a human.
- **Autonomous execution** — agents build isolated leaf nodes without creating tangled dependencies.
- **Quality gates** — implementations are checked against acceptance criteria and performance budgets.

## Workflow

| Phase | Command | Purpose |
|-------|---------|---------|
| Design | `monet design` | Human + AI co-author the recursive design tree |
| Build | `monet build` | Agents implement leaf nodes in isolation |
| Review | `monet review` | Audit implementation against criteria and metrics |

## Getting started

```bash
npm install
npm run build
npm start        # or: npm run dev
```

Configure a model by copying `config.sample.json` to your Monet config directory (for example `~/.monet/config.json`) and setting the provider credentials.

## Development

```bash
npm run lint
npm run typecheck
npm test
```

## Documentation

- `vision.md` — high-level vision and intent
- `architecture.md` — architecture overview

## Status

Early-stage / MVP. Interfaces and commands may change.
