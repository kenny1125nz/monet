import { readdirSync } from "node:fs";
import { logger } from "../../shared/logger.js";

/**
 * Present the design view for a given node — interactive tree navigator,
 * flow diagram, and contract details (see ## 11 of architecture.md).
 * Skeleton implementation; full UI rendering is handled by `monet ui`.
 */
export async function viewNode(nodePath: string): Promise<void> {
    logger.info("Rendering design view for node: %s", nodePath);

    // ── 1. Node identity ──────────────────────────────────────────────────
    console.log("\n━━━ Node: %s ━━━", nodePath);

    // ── 2. Sub-node listing (one layer only) ──────────────────────────────
    const subNodes = listSubDirectories(nodePath);
    if (subNodes.length > 0) {
        console.log("\nChildren:");
        for (const child of subNodes) {
            console.log("  📁 %s", child);
        }
    } else {
        console.log("\n(no child nodes)");
    }

    // ── 3. Contract summary (from node.md) ────────────────────────────────
    // In production: read and parse node.md, display Responsibility, Design,
    // Interface, Imports, Flow diagram, Acceptance Criteria, etc.
    console.log("\nContract:");
    console.log("  Responsibility:  (see node.md)");
    console.log("  Interface:       (see node.md)");
    console.log("  Imports:         (see node.md)");
    console.log("  Flow diagram:    (see node.md)");

    // ── 4. Status indicators ──────────────────────────────────────────────
    console.log("\nStatus:");
    console.log("  Frozen:    —");
    console.log("  Wave:      —");
    console.log("  Stale:     —");

    console.log("\n(Full design view available via `monet ui`)");
}

/**
 * List immediate sub-directories of a given path.
 */
export function listSubDirectories(dirPath: string): string[] {
    try {
        const entries = readdirSync(dirPath, { withFileTypes: true });
        return entries
            .filter((e) => e.isDirectory() && !e.name.startsWith("."))
            .map((e) => e.name)
            .sort();
    } catch {
        return [];
    }
}
