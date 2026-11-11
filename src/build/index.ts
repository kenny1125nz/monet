import type { NodeContract, MonetAgentAdapter } from "../core/types.js";
import { BuildError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

/**
 * Compute topological wave order using Kahn's algorithm on the DAG.
 * Returns an array of waves, where each wave is an array of node paths
 * that can be built in parallel.
 */
export function computeWaves(
    nodes: Map<string, NodeContract>,
): string[][] {
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
    const waves: string[][] = [];
    let queue: string[] = [];

    for (const [nodePath, degree] of inDegree) {
        if (degree === 0) {
            queue.push(nodePath);
        }
    }

    while (queue.length > 0) {
        waves.push([...queue]);
        const nextQueue: string[] = [];

        for (const nodePath of queue) {
            for (const neighbor of adjacency.get(nodePath) ?? []) {
                const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) {
                    nextQueue.push(neighbor);
                }
            }
        }

        queue = nextQueue;
    }

    // Check for cycles (if not all nodes were processed)
    const processedCount = waves.flat().length;
    if (processedCount < nodes.size) {
        const unprocessed = [...nodes.keys()].filter(
            (n) => !waves.flat().includes(n),
        );
        throw new BuildError(
            `Circular dependency detected among nodes: ${unprocessed.join(", ")}. ` +
            "Run `monet design --validate` to identify cycles.",
        );
    }

    return waves;
}

/**
 * Execute a build: dispatch coding agents to nodes wave by wave.
 */
export async function executeBuild(
    waves: string[][],
    nodes: Map<string, NodeContract>,
    agent: MonetAgentAdapter,
): Promise<void> {
    const completedFacades = new Map<string, string>();

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
        const wave = waves[waveIdx];
        logger.info("Processing wave %d with %d node(s)", waveIdx + 1, wave.length);

        const promises = wave.map(async (nodePath) => {
            const contract = nodes.get(nodePath);
            if (!contract) {
                throw new BuildError(`Node not found: ${nodePath}`);
            }

            // Build context bundle
            const importInterfaces = new Map<string, string>();
            for (const imp of contract.imports) {
                const importedNode = nodes.get(imp);
                if (importedNode) {
                    importInterfaces.set(imp, importedNode.interface);
                }
            }

            const task = {
                node: contract,
                contextBundle: {
                    ownContract: contract,
                    importInterfaces,
                    completedFacades: new Map(completedFacades),
                    designPrinciples: [],
                },
                workingDir: contract.path,
            };

            logger.debug("Dispatching agent for node: %s", nodePath);
            const result = await agent.execute(task);

            if (result.status === "blocked") {
                logger.warn("Node %s is blocked: %s", nodePath, result.findings ?? "Unknown reason");
            } else {
                logger.info("Node %s completed successfully", nodePath);
                // In production, we'd read the facade from the filesystem
                completedFacades.set(nodePath, `facade for ${nodePath}`);
            }
        });

        await Promise.all(promises);
    }

    logger.info("Build complete: %d waves processed", waves.length);
}
