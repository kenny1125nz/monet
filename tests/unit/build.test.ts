import { describe, it, expect } from "vitest";
import { computeWaves } from "../../src/build/index.js";
import type { NodeContract } from "../../src/core/types.js";

function makeNode(name: string, imports: string[]): NodeContract {
    return {
        path: `/nodes/${name}`,
        name,
        frontmatter: { frozen: true, wave: 0, stale: false },
        responsibility: "",
        design: "",
        interface: "",
        imports,
        acceptanceCriteria: [],
        performanceMeasurements: [],
    };
}

describe("computeWaves (Kahn's algorithm)", () => {
    it("returns a single wave for independent nodes", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
            ["/nodes/b", makeNode("b", [])],
            ["/nodes/c", makeNode("c", [])],
        ]);

        const waves = computeWaves(nodes);
        expect(waves.length).toBe(1);
        expect(waves[0].sort()).toEqual(["/nodes/a", "/nodes/b", "/nodes/c"]);
    });

    it("returns correct topological order for a chain", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", [])],
            ["/nodes/b", makeNode("b", ["/nodes/a"])],
            ["/nodes/c", makeNode("c", ["/nodes/b"])],
        ]);

        const waves = computeWaves(nodes);
        expect(waves.length).toBe(3);
        expect(waves[0]).toEqual(["/nodes/a"]);
        expect(waves[1]).toEqual(["/nodes/b"]);
        expect(waves[2]).toEqual(["/nodes/c"]);
    });

    it("handles diamond-shaped dependencies", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/root", makeNode("root", [])],
            ["/nodes/left", makeNode("left", ["/nodes/root"])],
            ["/nodes/right", makeNode("right", ["/nodes/root"])],
            ["/nodes/leaf", makeNode("leaf", ["/nodes/left", "/nodes/right"])],
        ]);

        const waves = computeWaves(nodes);
        expect(waves.length).toBe(3);
        expect(waves[0]).toEqual(["/nodes/root"]);
        expect(waves[1].sort()).toEqual(["/nodes/left", "/nodes/right"]);
        expect(waves[2]).toEqual(["/nodes/leaf"]);
    });

    it("throws on circular dependencies", () => {
        const nodes = new Map<string, NodeContract>([
            ["/nodes/a", makeNode("a", ["/nodes/b"])],
            ["/nodes/b", makeNode("b", ["/nodes/c"])],
            ["/nodes/c", makeNode("c", ["/nodes/a"])],
        ]);

        expect(() => computeWaves(nodes)).toThrow("Circular dependency");
    });
});
