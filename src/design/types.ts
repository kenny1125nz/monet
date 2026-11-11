import type { NodeContract } from "../core/types.js";

/**
 * Scoped toolset available to the design AI.
 * The design AI can only read/write node.md files, list the tree, and run validation.
 * It cannot access implementation files or run build commands.
 */
export interface DesignToolSet {
    readNode(path: string): Promise<NodeContract | null>;
    writeNode(path: string, contract: NodeContract): Promise<void>;
    listTree(path: string): Promise<string[]>;
    runValidate(): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * Context for the current design session.
 * Carries information about whether we're in fresh or revise mode,
 * and which nodes are affected.
 */
export interface DesignContext {
    /** The root node path for the current design session */
    rootNode: string;
    /** Whether this session is in revise mode */
    isRevise: boolean;
    /** If in revise mode, the set of stale/dirty node paths */
    affectedNodes?: Set<string>;
}

