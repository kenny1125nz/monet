# Monet Architecture — Root Context

## Overview

Monet is a CLI-based AI agent orchestrator that implements a PDCA loop — **Design → Build → Review**. It treats the directory tree as a representation of the system architecture, where every directory is a **Node Unit** with a contract defined in a `node.md` file.

---

## What Is a Self-Contained Node Unit?

Every directory in the workspace is a Node Unit. Its contract lives in a `node.md` file — a templated markdown file using heading levels as structure, TypeScript code blocks for schemas, and JSON code blocks for diagrams.

### Required Contract Sections

| Section                       | Authored by                | Phase  |
| ----------------------------- | -------------------------- | ------ |
| `## Responsibility`           | Human / AI proposal        | Design |
| `## Design`                   | Human / AI proposal        | Design |
| `## Exposes`                  | Human / AI proposal        | Design |
| `## Acceptance Criteria`      | Human / AI proposal        | Design |
| `## Performance Measurements` | Human / AI proposal        | Design |
| `## Flow` (JSON block)        | AI proposal, human reviews | Design |
| `## Interface Proposals`      | Coding agent               | Build  |
| `## Findings`                 | Human / review tooling     | Review |
| `## Changes`                  | Human / review tooling     | Review |

### Frontmatter (Lifecycle Fields)

```yaml
---
frozen: true
wave: 3
stale: false
---
```

- `frozen`: set by `monet design --freeze` after validation passes
- `wave`: topological wave number, stamped at freeze time
- `stale`: set by `monet design --validate` in revise mode when an upstream interface change is detected

### The `## Interface` Section

Declares the public surface this node exposes to other nodes. Always written in **TypeScript**, regardless of the target project's implementation language.

```typescript
export interface AuthService {
  validate(token: string): Promise<AuthResult>
  revoke(tokenId: string): Promise<void>
}
```

### The `## Imports` Section

Declares **behaviour references** — which other nodes this node functionally depends on at runtime. Human-authored at design time.

Visibility rules:
- Sharing only permitted between **sibling nodes** (within the same parent)
- Deeper nodes receive explicit **pass-downs** from their parent — these are treated as external (internal-external) dependencies
- Pass-downs are always human-authored at design time

### The `## Flow` Section

A JSON code block conforming to the shared `FlowGraph` data model. Documents how this node's sub-nodes interact (data flow). Covers **one layer only** — the immediate children of this node.

```json
{
  "nodes": [...],
  "edges": [...]
}
```

---

## Node/Edge Data Model

### FlowGraph

```typescript
interface FlowGraph {
  nodes: DiagramNode[]
  edges: FlowEdge[] | ComponentEdge[]
}
```

### DiagramNode

```typescript
interface DiagramNode {
  id: string              // node path e.g. "/api/auth"
  label: string
  responsibility: string
  status?: 'pending' | 'in_progress' | 'done' | 'blocked'
}
```

### BaseEdge

```typescript
interface BaseEdge {
  from: string
  to: string
  label?: string
  interface?: string      // TypeScript interface definition — on every edge
}
```

### FlowEdge (Design-time)

```typescript
interface FlowEdge extends BaseEdge {
  dataShape?: string
}
```

### ComponentEdge (Review-time)

```typescript
interface ComponentEdge extends BaseEdge {
  dependencyType?: 'runtime' | 'compile'
}
```

---

## The Facade Pattern

Every Node Unit has a `facade.ts` (or target-language equivalent) as its **sole legal import surface**. Other nodes may only import from the Facade — never from internal implementation files.

- The Facade mirrors the `## Interface` declared in `node.md`
- When the coding agent discovers the declared interface is incomplete, it appends proposals to `## Interface Proposals` in `node.md` and continues building optimistically against its proposed interface

---

## The PDCA Loop

```
monet design  →  monet build  →  monet review
     ↑                                  |
     |__________ Changes (long loop) ___|
          ↑                             |
          |_______ Findings (short loop)|
```

All phases have two modes:
- **Fresh**: first-time through the loop
- **Revise**: iterating on an existing implementation

---

## Key Principles

1. **Directory-as-Architecture**: The directory tree represents the architecture. Node Units capture ownership and decomposition. A separate behaviour reference graph captures runtime dependencies.

2. **One-Layer-Only**: Every view shows exactly one level of the hierarchy at a time. Navigate into a node to see its children.

3. **Governor of Constraints**: The Software Engineer shifts from "Writer of Logic" to "Governor of Constraints." Human effort goes into high-value design decisions while AI handles bounded implementation tasks.

4. **DAG Guarantee**: The behaviour reference graph must be a proven DAG before build can run. This guarantees deterministic build order, conflict-free parallel dispatch, and provable buildability.
