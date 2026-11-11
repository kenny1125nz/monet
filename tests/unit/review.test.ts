import { describe, it, expect } from "vitest";
import { generateReviewReport } from "../../src/review/index.js";
import type { NodeContract, NodeArchitecture } from "../../src/core/types.js";

function makeNode(name: string, imports: string[]): NodeContract {
    return {
        path: `/nodes/${name}`,
        name,
        frontmatter: { frozen: true, wave: 1, stale: false },
        responsibility: "",
        design: "",
        interface: "",
        imports,
        acceptanceCriteria: [],
        performanceMeasurements: [],
    };
}

function makeArch(imports: string[]): NodeArchitecture {
    return {
        exports: [],
        imports: imports.map((target) => ({
            source: "test",
            target,
            kind: "runtime" as const,
        })),
        complexity: { cyclomaticComplexity: 5, linesOfCode: 100 },
        symbols: [],
    };
}

describe("generateReviewReport", () => {
    it("returns pass for clean nodes", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
        ]);
        const archs = new Map<string, NodeArchitecture>([
            ["/nodes/a", makeArch([])],
        ]);

        const reports = generateReviewReport(nodes, archs);
        expect(reports).toHaveLength(1);
        expect(reports[0].status).toBe("pass");
    });

    it("flags undeclared dependencies as warnings", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
        ]);
        const archs = new Map<string, NodeArchitecture>([
            ["/nodes/a", makeArch(["/nodes/secret"])],
        ]);

        const reports = generateReviewReport(nodes, archs);
        expect(reports[0].status).toBe("warn");
        expect(reports[0].undeclaredDependencies).toHaveLength(1);
    });

    it("flags complexity breaches as failures", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
        ]);
        const archs = new Map<string, NodeArchitecture>([
            [
                "/nodes/a",
                {
                    exports: [],
                    imports: [],
                    complexity: { cyclomaticComplexity: 15, linesOfCode: 300 },
                    symbols: [],
                },
            ],
        ]);

        const reports = generateReviewReport(nodes, archs);
        expect(reports[0].status).toBe("fail");
        expect(reports[0].complexityBreaches).toHaveLength(2);
    });
});
