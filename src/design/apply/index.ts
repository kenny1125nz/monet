/**
 * Apply module — reads the ## Flow block of the current node and materialises
 * it into the filesystem.
 *
 * For each node listed in the flow graph that does not already exist as a
 * directory, creates the directory and seeds it with a minimal node.md
 * carrying the node's id, label, and responsibility from the flow entry.
 *
 * Idempotent — safe to re-run after editing the flow.
 * Existing directories and node.md files are left untouched.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { logger } from "../../shared/logger.js";
import type { FlowGraph } from "../../core/types.js";

/**
 * Result of an apply operation.
 */
export interface ApplyResult {
    /** Number of directories created */
    directoriesCreated: number;
    /** Number of node.md files created */
    filesCreated: number;
    /** Number of existing directories skipped */
    directoriesSkipped: number;
    /** Number of existing node.md files skipped */
    filesSkipped: number;
    /** Names of the nodes that were materialised */
    nodesApplied: string[];
}

/**
 * Read the ## Flow JSON block from a node.md file.
 * Returns null if no ## Flow section is found or it cannot be parsed.
 */
function readFlowFromNodeMd(nodeMdPath: string): FlowGraph | null {
    if (!existsSync(nodeMdPath)) {
        return null;
    }

    const content = readFileSync(nodeMdPath, "utf-8");

    // Match the ## Flow section with its JSON code block
    const flowRegex = /## Flow\n\n```json\n([\s\S]*?)\n```/;
    const match = content.match(flowRegex);

    if (!match) {
        return null;
    }

    try {
        const parsed = JSON.parse(match[1]);
        // Basic validation: must have nodes and edges arrays
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            logger.warn("Flow section in %s is missing 'nodes' or 'edges' array", nodeMdPath);
            return null;
        }
        return parsed as FlowGraph;
    } catch (err) {
        logger.warn("Failed to parse Flow JSON in %s: %s", nodeMdPath, (err as Error).message);
        return null;
    }
}

/**
 * Generate a minimal node.md content for a flow graph node.
 */
function generateNodeMd(nodeId: string, label: string, responsibility: string): string {
    return `# ${label}

## Responsibility

${responsibility}

## Interface

\`\`\`typescript
// TODO: Declare the public interface for ${nodeId}
\`\`\`

## Acceptance Criteria

- TODO: Define acceptance criteria

`;
}

/**
 * Apply the ## Flow block of the current node to the filesystem.
 *
 * Reads the ## Flow JSON block from the node.md at `nodePath`,
 * then for each node in the flow graph:
 *   - Creates a child directory if it doesn't exist
 *   - Seeds it with a minimal node.md if one doesn't already exist
 *
 * @param nodePath - Absolute path of the node whose ## Flow to apply
 * @returns Result summary of the apply operation
 */
export async function applyFlow(nodePath: string): Promise<ApplyResult> {
    const nodeMdPath = join(nodePath, "node.md");

    // ── 1. Read the ## Flow block ──────────────────────────────────────────
    const flow = readFlowFromNodeMd(nodeMdPath);

    if (!flow) {
        console.log("❌ No valid ## Flow section found in %s", nodeMdPath);
        console.log("   Run `decompose` first to generate a flow graph, or edit node.md to add a ## Flow section.");
        return {
            directoriesCreated: 0,
            filesCreated: 0,
            directoriesSkipped: 0,
            filesSkipped: 0,
            nodesApplied: [],
        };
    }

    if (flow.nodes.length === 0) {
        console.log("ℹ️  Flow graph is empty — nothing to apply.");
        return {
            directoriesCreated: 0,
            filesCreated: 0,
            directoriesSkipped: 0,
            filesSkipped: 0,
            nodesApplied: [],
        };
    }

    logger.info("Applying flow with %d node(s) from %s", flow.nodes.length, nodeMdPath);

    const result: ApplyResult = {
        directoriesCreated: 0,
        filesCreated: 0,
        directoriesSkipped: 0,
        filesSkipped: 0,
        nodesApplied: [],
    };

    // ── 2. Materialise each node ───────────────────────────────────────────
    for (const diagramNode of flow.nodes) {
        const childDir = resolve(nodePath, diagramNode.id);

        // Create directory if it doesn't exist
        if (!existsSync(childDir)) {
            mkdirSync(childDir, { recursive: true });
            result.directoriesCreated++;
            logger.debug("Created directory: %s", childDir);
        } else {
            result.directoriesSkipped++;
            logger.debug("Directory already exists, skipping: %s", childDir);
        }

        // Create node.md if it doesn't exist
        const childNodeMd = join(childDir, "node.md");
        if (!existsSync(childNodeMd)) {
            const content = generateNodeMd(diagramNode.id, diagramNode.label, diagramNode.responsibility);
            writeFileSync(childNodeMd, content, "utf-8");
            result.filesCreated++;
            result.nodesApplied.push(diagramNode.id);
            logger.debug("Created node.md: %s", childNodeMd);
        } else {
            result.filesSkipped++;
            logger.debug("node.md already exists, skipping: %s", childNodeMd);
        }
    }

    // ── 3. Print summary ───────────────────────────────────────────────────
    console.log("\n✅ Apply complete:");
    console.log("   📁 Directories created: %d", result.directoriesCreated);
    console.log("   📄 node.md files created: %d", result.filesCreated);
    console.log("   ⏭️  Directories skipped (already exist): %d", result.directoriesSkipped);
    console.log("   ⏭️  node.md files skipped (already exist): %d", result.filesSkipped);

    if (result.nodesApplied.length > 0) {
        console.log("\n   Nodes materialised:");
        for (const nodeId of result.nodesApplied) {
            console.log("     📁 %s", nodeId);
        }
    }

    return result;
}
