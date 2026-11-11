// ─── Core Domain Types ───────────────────────────────────────────────────────

/**
 * Represents a Node Unit — every directory in the workspace is a node.
 * Its contract lives in a `node.md` file.
 */
export interface NodeContract {
    /** Absolute path to the node directory */
    path: string;
    /** Node name (directory name) */
    name: string;
    /** Frontmatter lifecycle fields */
    frontmatter: NodeFrontmatter;
    /** The responsibility statement */
    responsibility: string;
    /** Internal topology — immediate sub-nodes and their interactions */
    design: string;
    /** Public interface declared in TypeScript */
    interface: string;
    /** Behaviour references — which other nodes this depends on */
    imports: string[];
    /** Acceptance criteria */
    acceptanceCriteria: string[];
    /** Performance constraints */
    performanceMeasurements: string[];
    /** Flow graph JSON (design-time data flow) */
    flow?: FlowGraph;
    /** Interface proposals from coding agents */
    interfaceProposals?: InterfaceProposal[];
    /** Human findings from review */
    findings?: string[];
    /** Change log entries */
    changes?: string[];
}

export interface NodeFrontmatter {
    frozen: boolean;
    wave: number;
    stale: boolean;
}

// ─── Flow Graph (shared data model) ──────────────────────────────────────────

export interface FlowGraph {
    nodes: DiagramNode[];
    edges: FlowEdge[];
}

export interface DiagramNode {
    id: string;
    label: string;
    responsibility: string;
    status?: "pending" | "in_progress" | "done" | "blocked";
}

export interface BaseEdge {
    from: string;
    to: string;
    label?: string;
    interface?: string;
}

export interface FlowEdge extends BaseEdge {
    dataShape?: string;
}

export interface ComponentEdge extends BaseEdge {
    dependencyType?: "runtime" | "compile";
}

// ─── Architecture JSON (produced by language packs) ──────────────────────────

export interface NodeArchitecture {
    exports: ExportedSymbol[];
    imports: ActualDependency[];
    complexity: ComplexityMetrics;
    symbols: Symbol[];
}

export interface ExportedSymbol {
    name: string;
    kind: "function" | "class" | "type" | "interface" | "const";
}

export interface ActualDependency {
    source: string;
    target: string;
    kind: "runtime" | "compile";
}

export interface ComplexityMetrics {
    cyclomaticComplexity: number;
    linesOfCode: number;
}

export interface Symbol {
    name: string;
    kind: "function" | "class" | "type" | "interface" | "const";
    line: number;
}

// ─── Agent / Build Types ─────────────────────────────────────────────────────

export interface MonetAgentAdapter {
    execute(task: NodeTask): Promise<TaskResult>;
}

export interface NodeTask {
    node: NodeContract;
    contextBundle: Bundle;
    workingDir: string;
}

export interface Bundle {
    ownContract: NodeContract;
    importInterfaces: Map<string, string>;
    completedFacades: Map<string, string>;
    designPrinciples: string[];
}

export interface TaskResult {
    status: "done" | "blocked";
    proposedInterfaceChanges?: InterfaceProposal[];
    findings?: string;
}

export interface InterfaceProposal {
    nodePath: string;
    proposedInterface: string;
    reason: string;
}

// ─── Validation Types ────────────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    nodePath: string;
    message: string;
    code: string;
}

export interface ValidationWarning {
    nodePath: string;
    message: string;
    code: string;
}

// ─── Config Types ────────────────────────────────────────────────────────────

export interface MonetConfig {
    /** Path to the global config directory (~/.monet) */
    configDir: string;
    /** AI model configuration */
    model: ModelConfig;
    /** Language pack selection */
    languagePack: string;
    /** Agent adapter configuration */
    agent: AgentConfig;
}

export interface ModelConfig {
    provider: "openai" | "anthropic" | "ollama";
    modelName: string;
    apiKey?: string;
    baseUrl?: string;
}

export interface AgentConfig {
    adapter: "aider" | string;
    timeout: number;
    maxRetries: number;
}
