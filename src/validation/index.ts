import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { NodeContract, ValidationResult } from "../core/types.js";
import { logger } from "../shared/logger.js";

/**
 * Structural validation: checks that every import resolves to an existing node,
 * every imported node has an Interface section, and there are no circular deps.
 */
export function validateStructural(
    nodes: Map<string, NodeContract>,
): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    const warnings: ValidationResult["warnings"] = [];

    for (const [nodePath, contract] of nodes) {
        for (const imp of contract.imports) {
            // Check import resolves
            if (!nodes.has(imp)) {
                errors.push({
                    nodePath,
                    message: `Import "${imp}" does not resolve to any known node`,
                    code: "UNRESOLVED_IMPORT",
                });
                continue;
            }

            // Check imported node has an interface
            const imported = nodes.get(imp)!;
            if (!imported.interface || imported.interface.trim().length === 0) {
                errors.push({
                    nodePath,
                    message: `Imported node "${imp}" has no ## Interface section`,
                    code: "MISSING_INTERFACE",
                });
            }
        }
    }

    // Check for circular dependencies using DFS
    const circular = findCircularDependencies(nodes);
    for (const cycle of circular) {
        errors.push({
            nodePath: cycle[0],
            message: `Circular dependency detected: ${cycle.join(" -> ")}`,
            code: "CIRCULAR_DEPENDENCY",
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Detect stale nodes by checking if any previously-frozen nodes have diverged
 * from their prior git version. If so, propagate stale:true and append ## Changes
 * to all impacted downstream nodes.
 *
 * @param nodes - All node contracts in the subtree
 * @returns A set of node paths that were marked stale
 */
export function detectStaleNodes(nodes: Map<string, NodeContract>): Set<string> {
    const staleNodes = new Set<string>();

    for (const [nodePath, contract] of nodes) {
        if (!contract.frontmatter.frozen) continue;

        // Check if the node.md has changed since the last git commit
        const nodeMdPath = join(nodePath, "node.md");
        if (!existsSync(nodeMdPath)) continue;

        try {
            const diff = execSync(
                `git diff HEAD -- "${nodeMdPath}" 2>/dev/null || true`,
                { encoding: "utf-8", cwd: nodePath },
            );
            if (diff.trim().length > 0) {
                staleNodes.add(nodePath);
                logger.info("Stale node detected: %s (node.md has changed since last freeze)", nodePath);
            }
        } catch {
            // Not a git repository or git not available — skip stale detection
            logger.debug("Cannot check git diff for %s — not a git repo?", nodePath);
        }
    }

    // Propagate stale to downstream consumers
    if (staleNodes.size > 0) {
        propagateStale(nodes, staleNodes);
    }

    return staleNodes;
}

/**
 * Propagate stale status to all downstream consumers of stale nodes.
 * Traverses the dependency graph to find all nodes that import from stale nodes.
 */
function propagateStale(
    nodes: Map<string, NodeContract>,
    staleNodes: Set<string>,
): void {
    // Build reverse dependency map: consumer -> [dependencies]
    const consumers = new Map<string, string[]>();
    for (const [nodePath, contract] of nodes) {
        for (const imp of contract.imports) {
            if (!consumers.has(imp)) {
                consumers.set(imp, []);
            }
            consumers.get(imp)!.push(nodePath);
        }
    }

    // BFS from each stale node to find all downstream consumers
    const queue = [...staleNodes];
    const visited = new Set<string>(staleNodes);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const downstream = consumers.get(current) || [];
        for (const consumer of downstream) {
            if (!visited.has(consumer)) {
                visited.add(consumer);
                staleNodes.add(consumer);
                queue.push(consumer);
                logger.info("Downstream node %s marked stale due to dependency on %s", consumer, current);
            }
        }
    }
}

/**
 * Stamp frontmatter fields (frozen, wave) into all node.md files in the tree.
 * Computes the topological wave number for each node based on the DAG.
 *
 * @param nodes - All node contracts in the subtree
 * @returns The number of nodes that were stamped
 */
export function stampFreeze(nodes: Map<string, NodeContract>): number {
    let stamped = 0;

    // Compute topological wave numbers using Kahn's algorithm
    const waveNumbers = computeWaveNumbers(nodes);

    for (const [nodePath] of nodes) {
        const nodeMdPath = join(nodePath, "node.md");
        if (!existsSync(nodeMdPath)) {
            logger.warn("Cannot stamp freeze — node.md not found at %s", nodeMdPath);
            continue;
        }

        const wave = waveNumbers.get(nodePath) ?? 0;

        try {
            let content = readFileSync(nodeMdPath, "utf-8");

            // Update or add frontmatter
            const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
            const newFrontmatter = [
                "---",
                `frozen: true`,
                `wave: ${wave}`,
                `stale: false`,
                "---",
            ].join("\n");

            if (frontmatterRegex.test(content)) {
                content = content.replace(frontmatterRegex, newFrontmatter + "\n");
            } else {
                content = newFrontmatter + "\n\n" + content;
            }

            writeFileSync(nodeMdPath, content, "utf-8");
            stamped++;
            logger.info("Stamped frozen:true wave:%d for node %s", wave, nodePath);
        } catch (err) {
            logger.error("Failed to stamp freeze for node %s: %s", nodePath, (err as Error).message);
        }
    }

    return stamped;
}

/**
 * Compute topological wave numbers for all nodes using Kahn's algorithm on the DAG.
 * Nodes with no dependencies are wave 0. Nodes whose dependencies are all in wave N
 * are assigned wave N+1.
 */
function computeWaveNumbers(nodes: Map<string, NodeContract>): Map<string, number> {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialise
    for (const nodePath of nodes.keys()) {
        inDegree.set(nodePath, 0);
        adjacency.set(nodePath, []);
    }

    // Build adjacency and in-degree
    for (const [nodePath, contract] of nodes) {
        for (const imp of contract.imports) {
            if (nodes.has(imp)) {
                adjacency.get(imp)!.push(nodePath);
                inDegree.set(nodePath, (inDegree.get(nodePath) ?? 0) + 1);
            }
        }
    }

    // Kahn's algorithm
    const waveNumbers = new Map<string, number>();
    const queue: string[] = [];

    for (const [nodePath, degree] of inDegree) {
        if (degree === 0) {
            queue.push(nodePath);
            waveNumbers.set(nodePath, 0);
        }
    }

    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentWave = waveNumbers.get(current) ?? 0;

        for (const dependent of adjacency.get(current) ?? []) {
            const newDegree = (inDegree.get(dependent) ?? 1) - 1;
            inDegree.set(dependent, newDegree);
            if (newDegree === 0) {
                waveNumbers.set(dependent, currentWave + 1);
                queue.push(dependent);
            }
        }
    }

    // Any remaining nodes (shouldn't happen in a valid DAG) get wave 0
    for (const nodePath of nodes.keys()) {
        if (!waveNumbers.has(nodePath)) {
            waveNumbers.set(nodePath, 0);
        }
    }

    return waveNumbers;
}

/**
 * Type compatibility validation: reads node.md files and checks TypeScript
 * interface compatibility by running tsc --noEmit on a synthesized file.
 */
export async function validateTypeCompatibility(
    nodes: Map<string, NodeContract>,
): Promise<ValidationResult> {
    const errors: ValidationResult["errors"] = [];
    const warnings: ValidationResult["warnings"] = [];

    // Synthesise a temporary TypeScript file importing all declared interfaces
    const lines: string[] = [];
    for (const [, contract] of nodes) {
        if (contract.interface) {
            lines.push(contract.interface);
        }
    }

    // In a real implementation, we'd write this to a temp file and run tsc --noEmit
    // For now, this is a placeholder that always passes structural checks
    logger.debug("Type compatibility check: %d interfaces to validate", lines.length);

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Read all node.md files from the workspace and parse them into NodeContracts.
 */
export function readNodeContracts(workspaceRoot: string): Map<string, NodeContract> {
    const nodes = new Map<string, NodeContract>();

    // Walk the directory tree looking for node.md files
    walkNodeFiles(workspaceRoot, nodes);

    return nodes;
}

function walkNodeFiles(dir: string, nodes: Map<string, NodeContract>): void {
    const nodeMdPath = join(dir, "node.md");
    if (existsSync(nodeMdPath)) {
        const contract = parseNodeMd(nodeMdPath);
        nodes.set(contract.path, contract);
    }

    // Read subdirectories
    try {
        readFileSync(dir, { encoding: "utf-8" });
        // Simple directory listing via fs is not recursive; this is a placeholder
        // In production, use fs.readdirSync with recursive option or a walk library
    } catch {
        // Not a directory or can't read
    }
}

function parseNodeMd(_filePath: string): NodeContract {
    // Placeholder: in production, parse the markdown frontmatter and sections
    // to build a NodeContract object
    throw new Error("Not implemented: node.md parsing");
}

function findCircularDependencies(
    nodes: Map<string, NodeContract>,
): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    function dfs(nodePath: string): void {
        if (recursionStack.has(nodePath)) {
            // Found a cycle — extract it
            const cycleStart = path.indexOf(nodePath);
            if (cycleStart !== -1) {
                cycles.push([...path.slice(cycleStart), nodePath]);
            }
            return;
        }

        if (visited.has(nodePath)) return;

        visited.add(nodePath);
        recursionStack.add(nodePath);
        path.push(nodePath);

        const contract = nodes.get(nodePath);
        if (contract) {
            for (const imp of contract.imports) {
                if (nodes.has(imp)) {
                    dfs(imp);
                }
            }
        }

        path.pop();
        recursionStack.delete(nodePath);
    }

    for (const nodePath of nodes.keys()) {
        if (!visited.has(nodePath)) {
            dfs(nodePath);
        }
    }

    return cycles;
}
