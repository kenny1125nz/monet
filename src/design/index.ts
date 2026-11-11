/**
 * Design module — facade that re-exports from sub-nodes.
 *
 * Sub-nodes:
 *   types.ts     — DesignToolSet interface
 *   loop/        — runDesignLoop (the continuous CLI loop)
 *   view/        — viewNode, listSubDirectories (design view rendering)
 *   init/        — initNode (node.md initialisation)
 *   decompose/   — decomposeNode (child node breakdown via LLM)
 *   apply/       — applyFlow (materialise flow graph into filesystem)
 */

export type { DesignToolSet, DesignContext } from "./types.js";
export { runDesignLoop } from "./loop/index.js";
export { viewNode, listSubDirectories } from "./view/index.js";
export { initNode } from "./init/index.js";
export { decomposeNode } from "./decompose/index.js";
export type { DecomposeResult } from "./decompose/index.js";
export { applyFlow } from "./apply/index.js";
export type { ApplyResult } from "./apply/index.js";
