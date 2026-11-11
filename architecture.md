# Project Monet: Architecture & Design Decisions

## 1. Core Philosophy

### The Directory-as-Architecture Principle
The directory tree is a **representation** of the architecture, not the architecture itself. Node Units capture ownership and decomposition. A separate behaviour reference graph captures runtime dependencies. These are two distinct concerns.

### The One-Layer-Only Principle
Every view — diagrams, reports, UI navigation — shows exactly **one level of the hierarchy** at a time. You navigate into a node to see its children. The whole tree is never rendered at once. This is the universal philosophy of the app, applied wherever applicable.

### The Governor of Constraints
The role of the Software Engineer shifts from "Writer of Logic" to "Governor of Constraints." Monet concentrates human effort into high-value design decisions while AI handles bounded implementation tasks.

---

## 2. Node Unit Contract

Every directory in the workspace is a Node Unit. Its contract lives in a `node.md` file — a templated markdown file using heading levels as structure, TypeScript code blocks for schemas, and JSON code blocks for diagrams.

### Contract Sections

| Section | Authored by | Phase |
|---|---|---|
| `## Responsibility` | Human / AI proposal | Design |
| `## Design` | Human / AI proposal | Design |
| `## Interface` | Human | Design |
| `## Acceptance Criteria` | Human / AI proposal | Design |
| `## Performance Measurements` | Human / AI proposal | Design |
| `## Flow` (JSON block) | AI proposal, human reviews | Design |
| `## Interface Proposals` | Coding agent | Build |
| `## Findings` | Human / review tooling | Review |
| `## Changes` | Human / review tooling | Review |

### The `## Interface` Section
Declares the public surface this node exposes to other nodes. Always written in **TypeScript**, regardless of the target project's implementation language. The coding agent translates this into the target language.

```typescript
// Example ## Interface block
export interface AuthService {
  validate(token: string): Promise<AuthResult>
  revoke(tokenId: string): Promise<void>
}
```

### The `## Flow` Section
A JSON code block conforming to the shared `FlowGraph` data model. Documents how this node's immediate children interact (data flow). Authored by the design AI, reviewed by human. Covers **one layer only** — the immediate children of this node.

This is the **authoritative source of dependency relationships**. A directed edge from node A to node B in the parent's `## Flow` is what gives A a dependency on B — nodes do not declare their own imports. The build system derives each node's dependency context by reading the edges in its parent's flow graph that point to it.

```json
{
  "nodes": [...],
  "edges": [...]
}
```

### External Reference Nodes
Dependencies on things outside the project tree (third-party libraries, databases, platform APIs, other services) are represented as **external reference nodes** — directories in the tree that contain a `node.md` with only a `## Responsibility` and `## Interface` section and an `external: true` frontmatter flag. No implementation is generated for them.

External reference nodes participate in the `## Flow` graph of their parent just like any other node. The build system recognises the `external: true` flag and skips agent dispatch for those nodes, but still provides their `## Interface` to any dependents as context.

```yaml
---
external: true
---
```

This keeps the dependency model uniform: everything a node depends on — sibling, child, or external — is expressed as an edge in the parent's flow graph pointing to a node with an `## Interface`.

### Lifecycle Fields (Frontmatter)
```yaml
---
frozen: true
wave: 3
stale: false
---
```

- `frozen`: set by `monet design freeze` after validation passes
- `wave`: topological wave number, stamped at freeze time
- `stale`: set by `monet design validate` when an upstream interface change is detected

---

## 3. The Facade Pattern

Every Node Unit has a `facade.ts` (or target-language equivalent) as its **sole legal import surface**. Other nodes may only import from the Facade — never from internal implementation files.

- Language-level visibility (`export`, `public`) is insufficient — the Facade is the architectural guarantee
- The Facade mirrors the `## Interface` declared in `node.md`
- When the coding agent discovers the declared interface is incomplete, it appends proposals to `## Interface Proposals` in `node.md` and continues building optimistically against its proposed interface
- Unresolved `## Interface Proposals` are **blocking items** in `monet review`

---

## 4. Cross-Cutting Concerns

### Conceptual Cross-Cutting (e.g. error handling patterns, auth conventions)
Translated into **design/implementation principles** passed as context to the coding agent. Not enforced structurally — enforced through agent prompting.

### Physical Cross-Cutting (shared libs/utils)
Governed by the sibling/pass-down visibility rules. No global escape hatch — even universal utilities follow the same governance.

### Interface Definitions
Always TypeScript, regardless of target project language. The coding agent handles translation to the target language. TypeScript serves as the universal contract language (analogous to Protobuf/OpenAPI).

---

## 5. Commands

### `monet init`
Bootstraps a new project. Creates root `node.md` in the current directory. Configuration lives globally at install time (`~/.monet/config`) — not per project. Greenfield only for the initial version; brownfield analysis is a future feature.

### `monet design`
A continuous CLI loop — like Claude Code — where the human prompts and the AI proposes decompositions by writing/updating `node.md` files via tool use. The loop runs until the human explicitly exits.

`monet design` can be run from **any directory** in the project tree. The directory from which it is launched is considered the **current designing node** — all design operations (reading, writing, validating) are scoped to that node and its children.

If any nodes carry `## Changes` in their `node.md`, `monet design` automatically enters **revise mode** — scoping the session to stale nodes and their dependents rather than a fresh design pass.

The design AI has a scoped toolset: `read_node`, `write_node`, `list_tree`, `run_validate`. It cannot access implementation files or run build commands.

#### In-loop commands
The loop input accepts either a natural language prompt (forwarded to the AI) or a recognised command keyword (executed directly). Commands and prompts share the same input — no special prefix required.

Navigation commands (operate on the **design scope**, not the shell's working directory):
- `cd ..` — moves scope up to the parent node
- `cd <relative-path>` — moves scope to a child or sibling node
- `cd <absolute-path>` — moves scope to any node in the project

The prompt always displays the current node path so the user knows where they are in the tree.

Control commands:
- `decompose` — triggers the AI to analyse the current node's `## Responsibility` and propose a child node breakdown: creates or updates child `node.md` files with draft `## Responsibility` and `## Interface` sections, and writes a draft `## Flow` block into the current node capturing the proposed data flow between children. The human reviews and refines the proposals before proceeding.
- `apply` — reads the `## Flow` block of the current node and materialises it into the filesystem: creates a directory for each node listed in the flow graph that does not already exist, and seeds it with a minimal `node.md` carrying the node's `id`, `label`, and `responsibility` from the flow entry. Existing directories and `node.md` files are left untouched. Idempotent — safe to re-run after editing the flow.
- `validate` — runs structural + type validation without freezing. Automatically detects whether any previously-frozen nodes have diverged from their prior git version; if so, propagates `stale: true` and appends `## Changes` to all impacted downstream nodes.
- `freeze` — runs full validation; if it passes, stamps `frozen: true` and `wave: N` into each node's frontmatter. `monet build` refuses to run against an unfrozen tree.
- `exit` / `quit` — exits the loop.

#### One-shot CLI invocation
The same control commands are also available as CLI subcommands for scripting and CI use, bypassing the interactive loop entirely:
- `monet design decompose`
- `monet design apply`
- `monet design validate`
- `monet design freeze`

### `monet build`
Reads the frozen behaviour reference graph, computes topological wave order mathematically (Kahn's algorithm on the DAG), and dispatches coding agents to nodes wave by wave. Nodes within the same wave have no dependencies on each other and are dispatched in parallel.

The build order is deterministic and provably deadlock-free because the freeze gate guarantees no cycles exist.

Each coding agent receives exactly:
1. Its own full `node.md`
2. The `## Interface` section from each node it depends on (derived from its parent's `## Flow` edges)
3. The `facade.ts` of each completed dependency (prior waves)
4. Global design principles (conceptual cross-cutting concerns)

Nothing else. No sibling code, no parent implementation, no full tree.

The coding agent produces a **node bundle**:
- Implementation files
- `facade.ts`
- Unit tests
- Benchmarks
- `test_report.md` and `benchmark_report.md`

The **language pack** is triggered during build to produce `architecture.json` via AST parsing.

`monet build` automatically detects whether to run in **fresh** or **revise** mode: if any nodes are marked `stale: true` or carry `## Findings`, it processes only those nodes (in topological order) rather than the full tree.

### `monet review`
Consolidates all node bundle outputs and renders an HTML report. Review is primarily a **human activity** — the tool provides structured evidence, the human makes judgements.

The report contains per node:
- Component dependency diagram (rendered from `architecture.json`)
- Test report (from `test_report.md`)
- Benchmark report (from `benchmark_report.md`)
- Facade vs declared interface comparison
- Undeclared dependency flags
- Complexity budget breaches
- Unresolved `## Interface Proposals`

Two possible human outcomes after review:
1. **Findings** → append `## Findings` to affected `node.md` files → run `monet build` (auto-enters revise mode, short loop)
2. **Changes** → append `## Changes` to affected `node.md` files → run `monet design` (auto-enters revise mode, long loop, git-versioned)

---

## 6. The PDCA Loop

```
monet design  →  monet build  →  monet review
     ↑                                  |
     |__________ Changes (long loop) ___|
          ↑                             |
          |_______ Findings (short loop)|
```

All phases have two modes, selected automatically by the CLI based on node state:
- **Fresh**: no stale nodes, no `## Findings` / `## Changes` present — processes the full tree
- **Revise**: stale nodes or pending findings/changes detected — scopes processing to affected nodes only

---

## 7. Validation & The DAG Guarantee

`monet design validate` runs two tiers:

**Structural validation** (always runs):
- Every edge in every `## Flow` graph resolves to an existing child node or external reference node
- Every node referenced as a dependency has an `## Interface` section
- No circular dependencies across the full flow graph

**Type compatibility** (always runs):
- Parses TypeScript blocks from all contracts
- Synthesises a temporary file importing all declared interfaces
- Runs `tsc --noEmit` to detect mismatches

If `monet design freeze` passes, the behaviour reference graph is a proven **DAG**, which guarantees:
- Build order is deterministic
- Parallel dispatch within waves is conflict-free
- Build always terminates — no deadlocks possible

This is a **provable buildability guarantee** before a single agent runs.

---

## 8. Revise Mode: Change Propagation

When `## Changes` are merged into a node's design, `monet design validate` automatically detects revise context:
1. Detects interface changes by diffing against the previous git version
2. Traverses the dependency graph to find all consumers
3. Appends `## Changes` to each impacted node
4. Marks impacted nodes `stale: true` in frontmatter

`monet build` then detects the stale nodes and processes them in topological order. Git captures the full before/after state of all affected `node.md` files as a versioned commit.

---

## 9. Language Packs

A language pack provides AST parsing for a specific target language. Selected by the user at config time. Triggered during `monet build` to produce `architecture.json` per node.

### Standard `architecture.json` Schema

```typescript
interface NodeArchitecture {
  exports: ExportedSymbol[]      // what the node actually exposes
  imports: ActualDependency[]    // what it actually imports
  complexity: ComplexityMetrics  // cyclomatic complexity, LOC
  symbols: Symbol[]              // classes, functions, types defined
}
```

Function-level logic flow analysis is **out of scope** — AST parsing provides structural evidence only. Human review fills the gap.

**Initial language packs:** React/TSX and Java.

---

## 10. The Flow Data Model

Shared between design-time flow diagrams and review-time component diagrams. Both views render from the same graph renderer using this schema.

```typescript
interface FlowGraph {
  nodes: DiagramNode[]
  edges: FlowEdge[] | ComponentEdge[]
}

interface DiagramNode {
  id: string              // node path e.g. "/api/auth"
  label: string
  responsibility: string
  status?: 'pending' | 'in_progress' | 'done' | 'blocked'
}

interface BaseEdge {
  from: string
  to: string
  label?: string
  interface?: string      // TypeScript interface definition — on every edge
}

// Design-time: data flowing between nodes (from node.md JSON block)
interface FlowEdge extends BaseEdge {
  dataShape?: string
}

// Review-time: actual dependencies (from architecture.json)
interface ComponentEdge extends BaseEdge {
  dependencyType?: 'runtime' | 'compile'
}
```

The `interface` field on `BaseEdge` is the key shared property — clicking any edge in either diagram surfaces the TypeScript interface definition for that interaction.

---

## 11. The Web UI (`monet ui`)

A single local web application serving both the design explorer and the review report. Reads from the file system live.

### Design View
- Interactive tree navigator (one layer at a time)
- Flow diagram per node (rendered from `## Flow` JSON block in `node.md`)
- Click a node → full contract details
- Click an edge → TypeScript interface definition

### Review View
- Component dependency diagram per node (rendered from `architecture.json`)
- Test and benchmark reports
- Facade vs declared interface diff
- Unresolved `## Interface Proposals` flagged as blocking

Both views share the same graph renderer component, fed by their respective data source.

---

## 12. Technology Stack

### Monet CLI & Core
- **Runtime:** TypeScript / Node.js
- **CLI framework:** TBD (Commander or Oclif)

### Design Phase AI
- **SDK:** Vercel AI SDK (`ai` package) — unified interface for OpenAI and Anthropic
- **Model:** Strong model, user-configured (e.g. Claude Sonnet/Opus or GPT-4o)
- **Interaction:** Continuous CLI loop with scoped tool use (`read_node`, `write_node`, `list_tree`, `run_validate`)

### Build Phase Agents
- **Integration model:** Plugin/adapter pattern
- **Abstract interface:**
```typescript
interface MonetAgentAdapter {
  execute(task: NodeTask): Promise<TaskResult>
}

interface NodeTask {
  node: NodeContract
  contextBundle: Bundle    // own contract + import interfaces + facades
  workingDir: string       // scoped to this node's directory
}

interface TaskResult {
  status: 'done' | 'blocked'
  proposedInterfaceChanges?: InterfaceProposal[]
  findings?: string
}
```
- **Reference implementation:** [Aider](https://aider.chat) — CLI-native, BYO API key, OpenAI-compatible endpoints, supports Ollama for self-hosted
- **Community:** Additional adapters left to open source

### Web UI
- Local web app, served by `monet ui`
- Tech: TBD (React or lightweight alternative)
- Shared graph renderer for flow and component diagrams

---

## 13. Bootstrap Strategy

Monet itself is designed and built following its own philosophy and process. This is both a validation of the approach and a forcing function for the MVP.

**Bootstrap sequence:**
1. Hand-build the MVP of `monet design` — the continuous CLI loop, file writing via tool use, `monet design validate` (structural only first)
2. Use `monet design` to design Monet's remaining components as Node Units
3. Use `monet build` (once built) to implement those components — the first real test of the executor is building itself

**Priority order:** The design phase must ship first. It is the prerequisite for everything else and the core value of the product.
