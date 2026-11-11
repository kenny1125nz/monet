import type { NodeContract, NodeArchitecture } from "../core/types.js";

/**
 * Review report for a single node.
 */
export interface NodeReviewReport {
    nodePath: string;
    nodeName: string;
    /** Component dependency diagram data */
    architecture?: NodeArchitecture;
    /** Test report content */
    testReport?: string;
    /** Benchmark report content */
    benchmarkReport?: string;
    /** Facade vs declared interface comparison */
    facadeComparison?: FacadeComparison;
    /** Undeclared dependency flags */
    undeclaredDependencies: string[];
    /** Complexity budget breaches */
    complexityBreaches: string[];
    /** Unresolved interface proposals */
    unresolvedProposals: string[];
    /** Overall status */
    status: "pass" | "warn" | "fail";
}

export interface FacadeComparison {
    declaredInterface: string;
    actualFacade: string;
    missingExports: string[];
    extraExports: string[];
    match: boolean;
}

/**
 * Consolidate all node bundle outputs and render a review report.
 */
export function generateReviewReport(
    nodes: Map<string, NodeContract>,
    architectures: Map<string, NodeArchitecture>,
): NodeReviewReport[] {
    const reports: NodeReviewReport[] = [];

    for (const [nodePath, contract] of nodes) {
        const arch = architectures.get(nodePath);
        const report: NodeReviewReport = {
            nodePath,
            nodeName: contract.name,
            architecture: arch,
            undeclaredDependencies: detectUndeclaredDependencies(contract, arch),
            complexityBreaches: checkComplexityBudget(arch),
            unresolvedProposals: (contract.interfaceProposals ?? []).map(
                (p) => `${p.nodePath}: ${p.reason}`,
            ),
            status: "pass",
        };

        // Determine overall status
        if (report.unresolvedProposals.length > 0 || report.complexityBreaches.length > 0) {
            report.status = "fail";
        } else if (report.undeclaredDependencies.length > 0) {
            report.status = "warn";
        }

        reports.push(report);
    }

    return reports;
}

/**
 * Detect dependencies that exist in the actual implementation
 * but were not declared in the ## Imports section.
 */
function detectUndeclaredDependencies(
    contract: NodeContract,
    arch?: NodeArchitecture,
): string[] {
    if (!arch) return [];

    const undeclared: string[] = [];
    for (const dep of arch.imports) {
        if (!contract.imports.includes(dep.target)) {
            undeclared.push(`${dep.source} -> ${dep.target} (${dep.kind})`);
        }
    }
    return undeclared;
}

/**
 * Check if complexity metrics exceed budget thresholds.
 */
function checkComplexityBudget(arch?: NodeArchitecture): string[] {
    if (!arch) return [];

    const breaches: string[] = [];
    const MAX_COMPLEXITY = 10;
    const MAX_LOC = 200;

    if (arch.complexity.cyclomaticComplexity > MAX_COMPLEXITY) {
        breaches.push(
            `Cyclomatic complexity ${arch.complexity.cyclomaticComplexity} exceeds max ${MAX_COMPLEXITY}`,
        );
    }

    if (arch.complexity.linesOfCode > MAX_LOC) {
        breaches.push(
            `Lines of code ${arch.complexity.linesOfCode} exceeds max ${MAX_LOC}`,
        );
    }

    return breaches;
}

/**
 * Render a text summary of all review reports to stdout.
 */
export function printReviewSummary(reports: NodeReviewReport[]): void {
    console.log("\n=== Monet Review Report ===\n");

    let passed = 0;
    let warned = 0;
    let failed = 0;

    for (const report of reports) {
        const icon = report.status === "pass" ? "✓" : report.status === "warn" ? "⚠" : "✗";
        console.log(`${icon} ${report.nodeName} (${report.nodePath})`);

        if (report.undeclaredDependencies.length > 0) {
            console.log("   Undeclared dependencies:");
            for (const dep of report.undeclaredDependencies) {
                console.log(`     - ${dep}`);
            }
        }

        if (report.complexityBreaches.length > 0) {
            console.log("   Complexity breaches:");
            for (const breach of report.complexityBreaches) {
                console.log(`     - ${breach}`);
            }
        }

        if (report.unresolvedProposals.length > 0) {
            console.log("   Unresolved interface proposals:");
            for (const prop of report.unresolvedProposals) {
                console.log(`     - ${prop}`);
            }
        }

        console.log();

        if (report.status === "pass") passed++;
        else if (report.status === "warn") warned++;
        else failed++;
    }

    console.log(`Summary: ${passed} passed, ${warned} warnings, ${failed} failed`);
}
