/**
 * Decompose module — analyses a node's ## Responsibility and proposes
 * a child node breakdown via the LLM.
 *
 * The AI proposes a ## Flow section for the parent node.md,
 * describing how the child nodes interact (data flow).
 *
 * No human interaction — the review of the design is addressed separately.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../config/index.js";
import { generateCompletion } from "../../llm/index.js";
import { logger } from "../../shared/logger.js";

/**
 * Result of a decomposition operation.
 */
export interface DecomposeResult {
    /** Whether the decomposition was accepted by the user */
    accepted: boolean;
}

/**
 * Analyse the current node's ## Responsibility and propose a child node breakdown.
 *
 * Reads the current node's node.md, sends it to the LLM with a decomposition prompt,
 * and patches the parent node.md with a ## Flow section containing the flow graph.
 *
 * @param nodePath - Absolute path of the node to decompose
 * @returns Result of the decomposition
 */
export async function decomposeNode(nodePath: string): Promise<DecomposeResult> {
    const nodeName = nodePath.split("/").filter(Boolean).pop() || "root";
    const nodeMdPath = join(nodePath, "node.md");

    // ── 1. Read the current node's contract ────────────────────────────────
    if (!existsSync(nodeMdPath)) {
        console.log("❌ No node.md found at %s", nodeMdPath);
        console.log("   Run `init` first to create a node.md for this node.");
        return { accepted: false };
    }

    const nodeMdContent = readFileSync(nodeMdPath, "utf-8");
    logger.info("Decomposing node: %s", nodePath);

    // ── 2. Build the LLM prompt ───────────────────────────────────────────
    const llmPrompt = `You are a software architect analysing a Node Unit for decomposition.

## Current Node

Path: ${nodePath}
Name: ${nodeName}

## Current node.md

${nodeMdContent}

## Task

Analyse the ## Responsibility section of the current node and propose a decomposition into self-containing child Node Units. Each child node should represent a cohesive sub-responsibility. Avoid decomposing based on technical layers (e.g. "API", "Database") unless it's getting close to leaf nodes and instead focus on responsibilities from business/domain perspective.

For each proposed child node, provide:
1. **name** — a short kebab-case directory name (e.g. "auth-service")
2. **responsibility** — what this child node is responsible for
3. **exposes** — the TypeScript interface this child node exposes (the public surface)

Also propose **edges** describing how data flows between the child nodes. Each edge connects a source node to a target node.

Rules:
- Each child must have a distinct, non-overlapping responsibility
- Only decompose one level at a time (don't propose grandchildren)
- Edges should only reference nodes proposed in this decomposition

Respond with a JSON object containing "nodes" and "edges":
  \`\`\`json
{
  "nodes": [
    {
      "name": "directory-name",
      "responsibility": "What this node does",
      "exposes": "export interface ServiceName { ... }"
    }
  ],
  "edges": [
    {
      "from": "source-node-name",
      "to": "target-node-name",
      "label": "brief description of data flow",
      "interface": "TypeScript interface for the interaction",
      "dataShape": "description of the data shape being passed"
    }
  ]
}
  \`\`\`

If the node is already at a leaf level and should not be decomposed further, respond with: {"nodes": [], "edges": []}

Respond with ONLY the JSON object. No explanation, no markdown formatting.`;

    console.log("\n🔍 Analysing node for decomposition...\n");

    // ── 3. Call the LLM ───────────────────────────────────────────────────
    let flowJson: string;

    try {
        const config = loadConfig();
        logger.info("Calling LLM for decomposition: provider=%s model=%s", config.model.provider, config.model.modelName);

        const result = await generateCompletion(config.model, {
            system: "You are a software architect. Respond with ONLY valid JSON, no explanation.",
            prompt: llmPrompt,
        });

        flowJson = result.text.trim();
        logger.info("LLM decomposition response received (%d characters)", flowJson.length);

        // Validate it's parseable JSON
        JSON.parse(flowJson);
    } catch (err) {
        logger.error("LLM decomposition call failed: %s", (err as Error).message);
        console.log("\n⚠️  LLM call failed: %s", (err as Error).message);
        return { accepted: false };
    }

    // ── 4. Patch the parent node.md with the ## Flow section ──────────────
    patchFlowSection(nodeMdPath, flowJson);
    console.log("✅ Patched ## Flow section in %s", nodeMdPath);

    console.log("\n✅ Decomposition complete.");
    return { accepted: true };
}

/**
 * Patch the ## Flow section in a node.md file with the given flow graph JSON.
 * If a ## Flow section already exists, it is replaced.
 * If none exists, it is appended before the first ## Findings or ## Changes section,
 * or at the end of the file.
 */
function patchFlowSection(nodeMdPath: string, flowJson: string): void {
    const content = readFileSync(nodeMdPath, "utf-8");
    const flowSection = `## Flow\n\n\`\`\`json\n${flowJson}\n\`\`\``;

    // Check if a ## Flow section already exists
    const flowRegex = /## Flow\n\n```json\n[\s\S]*?\n```/;
    if (flowRegex.test(content)) {
        // Replace existing ## Flow section
        const updated = content.replace(flowRegex, flowSection);
        writeFileSync(nodeMdPath, updated, "utf-8");
        logger.debug("Replaced existing ## Flow section in %s", nodeMdPath);
        return;
    }

    // No existing ## Flow — find the right insertion point.
    // Insert before ## Findings, ## Changes, or at end of file.
    const insertBeforeRegex = /^(?=## (?:Findings|Changes))/m;
    const match = content.match(insertBeforeRegex);

    if (match) {
        const insertPos = match.index!;
        const updated =
            content.slice(0, insertPos) +
            flowSection + "\n\n" +
            content.slice(insertPos);
        writeFileSync(nodeMdPath, updated, "utf-8");
        logger.debug("Inserted ## Flow section before ## Findings/Changes in %s", nodeMdPath);
    } else {
        // Append at the end
        const updated = content.trimEnd() + "\n\n" + flowSection + "\n";
        writeFileSync(nodeMdPath, updated, "utf-8");
        logger.debug("Appended ## Flow section at end of %s", nodeMdPath);
    }
}
