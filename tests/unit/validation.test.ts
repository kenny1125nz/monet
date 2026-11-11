import { describe, it, expect } from "vitest";
import { validateStructural } from "../../src/validation/index.js";
import type { NodeContract } from "../../src/core/types.js";

function makeNode(name: string, imports: string[], interfaceDecl?: string): NodeContract {
    return {
        path: `/nodes/${name}`,
        name,
        frontmatter: { frozen: false, wave: 0, stale: false },
        responsibility: "",
        design: "",
        interface: interfaceDecl ?? "",
        imports,
        acceptanceCriteria: [],
        performanceMeasurements: [],
    };
}

describe("validateStructural", () => {
    it("passes for a valid graph with no imports", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
            ["/nodes/b", makeNode("b", [])],
        ]);

        const result = validateStructural(nodes);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("passes for valid imports with interfaces", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [], "export interface A {}")],
            ["/nodes/b", makeNode("b", ["/nodes/a"])],
        ]);

        const result = validateStructural(nodes);
        expect(result.valid).toBe(true);
    });

    it("fails on unresolved imports", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", ["/nodes/nonexistent"])],
        ]);

        const result = validateStructural(nodes);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe("UNRESOLVED_IMPORT");
    });

    it("fails when imported node has no interface", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
            ["/nodes/b", makeNode("b", ["/nodes/a"])],
        ]);

        const result = validateStructural(nodes);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe("MISSING_INTERFACE");
    });

    it("detects circular dependencies", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", ["/nodes/b"])],
            ["/nodes/b", makeNode("b", ["/nodes/c"])],
            ["/nodes/c", makeNode("c", ["/nodes/a"])],
        ]);

        const result = validateStructural(nodes);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });
});
