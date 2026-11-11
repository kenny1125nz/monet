
# The `## Flow` Section

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
