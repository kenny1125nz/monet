---
frozen: false
wave: 0
stale: false
---

## Responsibility

The root node of the Monet architecture system. It owns the top-level project directory and is responsible for:
- Serving as the single entry point for all Monet CLI commands (`init`, `design`, `build`, `review`, `ui`).
- Defining the global design principles and the Node Unit Contract format.
- Coordinating the decomposition of the system into child Node Units and governing the overall build, validation, and review lifecycle.
- Providing the canonical representation of the architecture through the directory tree and the `node.md` contracts.
- Ensuring that the one-layer-only principle, facade pattern, and DAG-based wave ordering are enforced at the system level.

## Input

None. The root node operates on the filesystem state and user commands. It does not receive structured data from any internal node.

## Output

The root node produces:
- A validated, frozen behaviour reference graph (the complete DAG of all Node Units) after successful `monet design freeze`.
- A built, working software system after `monet build`, consisting of implementation files, facades, tests, benchmarks, and reports.
- An HTML review report after `monet review`.
- A local web UI for design exploration and review (via `monet ui`).

## Behaviour references

The root node depends on the following external systems (represented as external reference nodes elsewhere in the tree):
- Node.js runtime (>=18)
- TypeScript compiler (`tsc`)
- Vercel AI SDK (`ai` package)
- OpenAI / Anthropic API (model endpoints)
- Aider (or compatible build agent adapter)
- Git (for versioning changes)
- Filesystem (read/write access to project tree)

No internal node dependencies at this level – internal dependencies are defined in child nodes' `## Flow` sections.

## Exposes

The root node exposes the following public interfaces (via CLI commands and the Web UI):

```typescript
// CLI command signatures (implemented by child nodes)
interface MonetCLI {
  init(): Promise<void>
  design(): Promise<void>        // interactive loop
  designDecompose(): Promise<void>
  designApply(): Promise<void>
  designValidate(): Promise<void>
  designFreeze(): Promise<void>
  build(): Promise<void>
  review(): Promise<void>
  ui(): Promise<void>
}

// Web UI entry point
interface MonetUI {
  start(port: number): Promise<void>
}

// Node Unit interface contract format (as read from node.md)
interface NodeContract {
  id: string
  path: string
  responsibility: string
  interfaceDeclaration: string            // TypeScript block
  flowGraph?: FlowGraph
  acceptanceCriteria: string[]
  performanceMeasurements: string[]
  lifecycle: { frozen: boolean; wave: number; stale: boolean }
}
```

## Acceptance Criteria

1. All CLI commands (`init`, `design`, `build`, `review`, `ui`) execute without unhandled exceptions when run from the project root.
2. `monet design` continuous loop correctly parses and writes `node.md` files using the specified tool set (`read_node`, `write_node`, `list_tree`, `run_validate`).
3. `monet design validate` detects all structural violations (unresolved edges, missing interfaces, cycles) and type mismatches via `tsc --noEmit`.
4. `monet design freeze` stamps `frozen: true` and `wave:` only after passing validation; rejects otherwise.
5. `monet build` processes nodes in topological wave order, dispatches agents correctly, and produces implementation files, facades, and reports in each node directory.
6. `monet review` generates an HTML report containing per-node component diagrams, test/benchmark reports, facade comparisons, and unresolved interface proposals.
7. `monet ui` serves a local web app that renders the design explorer and review report, showing exactly one level of the tree at a time.
8. Revise mode correctly propagates `## Changes` and `stale` flags when upstream interfaces change.

## Performance Measurements

- CLI command startup time: < 500ms (cold start).
- `monet design validate` for a 50‑node tree: < 5 seconds.
- `monet design freeze` for a 50‑node tree: < 10 seconds.
- `monet build` for a 50‑node tree with 10 waves: < 5 minutes (assuming API call latency of ~2s per agent).
- `monet review` HTML generation for a 50‑node tree: < 3 seconds.
- `monet ui` page load time: < 2 seconds.
- Memory usage during `monet build`: < 512MB RSS.
- The system must remain responsive (no blocking UI) even when processing large trees.

## Flow

```json
{
  "nodes": [
    {
      "name": "cli",
      "responsibility": "Parse user commands and route them to the appropriate child node (design, build, review, ui). Handle user interaction and error messages.",
      "exposes": "export interface CLI { run(argv: string[]): Promise<void>; }"
    },
    {
      "name": "design",
      "responsibility": "Manage the design lifecycle: parse and write node.md files, run validation (structural and type checks), enforce design principles (one-layer, facade, DAG wave ordering), and freeze the architecture graph.",
      "exposes": "export interface DesignEngine { design(): Promise<void>; designDecompose(): Promise<void>; designApply(): Promise<void>; designValidate(): Promise<void>; designFreeze(): Promise<void>; getFrozenGraph(): FrozenGraph; }"
    },
    {
      "name": "build",
      "responsibility": "Orchestrate the build process: process nodes in topological wave order, dispatch build agents (e.g., Aider), generate implementation files, facades, tests, benchmarks, and reports per node.",
      "exposes": "export interface BuildEngine { build(graph: FrozenGraph): Promise<BuildResult>; }"
    },
    {
      "name": "review",
      "responsibility": "Generate an HTML review report containing per-node component diagrams, test/benchmark reports, facade comparisons, and unresolved interface proposals.",
      "exposes": "export interface ReviewEngine { generateReport(buildResult: BuildResult): Promise<string>; }"
    },
    {
      "name": "ui",
      "responsibility": "Serve a local web application for design exploration and review, showing exactly one level of the architecture tree at a time.",
      "exposes": "export interface UIServer { start(port: number): Promise<void>; }"
    }
  ],
  "edges": [
    {
      "from": "cli",
      "to": "design",
      "label": "Dispatch design-related commands",
      "interface": "DesignEngine",
      "dataShape": "Command name and optional parameters (e.g., 'decompose', 'validate')"
    },
    {
      "from": "cli",
      "to": "build",
      "label": "Dispatch build command",
      "interface": "BuildEngine",
      "dataShape": "None (build reads frozen graph from design node)"
    },
    {
      "from": "cli",
      "to": "review",
      "label": "Dispatch review command",
      "interface": "ReviewEngine",
      "dataShape": "None (review reads build result from build node)"
    },
    {
      "from": "cli",
      "to": "ui",
      "label": "Dispatch ui command",
      "interface": "UIServer",
      "dataShape": "Port number"
    },
    {
      "from": "design",
      "to": "build",
      "label": "Provide frozen architecture graph to build orchestrator",
      "interface": "FrozenGraph",
      "dataShape": "Complete DAG of all Node Units with frozen metadata and interfaces"
    },
    {
      "from": "build",
      "to": "review",
      "label": "Provide built implementation results to review generator",
      "interface": "BuildResult",
      "dataShape": "Per-node implementation files, facades, test/benchmark outputs, and status"
    },
    {
      "from": "design",
      "to": "ui",
      "label": "Provide current design graph for UI exploration",
      "interface": "FrozenGraph",
      "dataShape": "Graph of Node Units with interfaces and dependencies (unfrozen or frozen)"
    }
  ]
}
```
