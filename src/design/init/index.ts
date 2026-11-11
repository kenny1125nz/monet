import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { logger } from "../../shared/logger.js";
import { loadConfig } from "../../config/index.js";
import { generateCompletion } from "../../llm/index.js";

/**
 *
 * If a markdown spec file is provided (relative path from the current node),
 * the entire file content is passed to the LLM as context, and the LLM is asked
 * to propose a complete node.md covering the standard templates and decomposition.
 *
 * @param nodePath - Absolute path of the node to initialise
 * @param specFile - Optional path to a markdown spec file (relative to nodePath)
 */
export async function initNode(nodePath: string, specFile: string): Promise<void> {
    let nodeName = nodePath.split("/").filter(Boolean).pop() || "root";
    if (nodeName === 'src')
        nodeName = "root";

    let userInput: string;
    let inputDescription: string;

    // ── 1. Gather input: from spec file or interactive questions ──────────
    const specPath = resolve(nodePath, specFile);
    if (!existsSync(specPath)) {
        console.log("❌ Spec file not found: %s", specPath);
        return;
    }
    userInput = readFileSync(specPath, "utf-8");
    inputDescription = `spec file (${specFile})`;
    logger.info("Using spec file: %s", specPath);
    console.log("📄 Loaded spec from: %s", specFile);
    // ── 2. Build the LLM prompt ───────────────────────────────────────────
    const llmPrompt = `You are a software business analyst elaborating a the key characteristics of a Node Unit for the Monet architecture system.

Node path: ${nodePath}
Node name: ${nodeName}

Below is the input specification provided by the user (from ${inputDescription}):

${userInput}

Based on this input, please propose a complete \`node.md\` file for this node following the Monet Node Unit Contract format. The file must include all standard sections:

---
frozen: false
wave: 0
stale: false
---

## Responsibility

(What this node is responsible for)

## Input
(what's expected input to this node, if any. If the node has no input, write "none". it can be pure text description for high leveol nodes, or a detailed data schema for leaf nodes)
## Output
(what's expected output to this node, if any. If the node has no output, write "none". it can be pure text description for high leveol nodes, or a detailed data schema for leaf nodes)

(Behaviour references — which other nodes this depends on)

## Exposes
(what this node exposes to the outside, e.g. APIs, events, data, etc in typescript code block. If none, write "none".)

## Acceptance Criteria

(Measurable criteria for acceptance)

## Performance Measurements

(Any performance constraints or SLAs)

You dont need to decompose the node into sub-nodes, currently we focus on the node as a whole.

Respond with ONLY the complete \`node.md\` content. Do not include any explanation.`;

    console.log("\n🤖 Requesting LLM to propose node.md...\n");

    // ── 3. Call the LLM via the abstraction layer ─────────────────────────
    let nodeMdContent: string | null = null;

    try {
        const config = loadConfig();

        logger.info("Calling LLM: provider=%s model=%s", config.model.provider, config.model.modelName);

        const result = await generateCompletion(config.model, {
            system: "You are a software architect. Respond with ONLY the requested content, no explanation.",
            prompt: llmPrompt
        });


        nodeMdContent = result.text;
        logger.info("LLM response received (%d characters)", nodeMdContent.length);
    } catch (err) {
        logger.error("LLM call failed: %s", (err as Error).message);
        console.log("\n⚠️  LLM call failed: %s", (err as Error).message);
        console.log("Falling back to manual entry.\n");
    }

    // ── 4. Write the node.md file directly (no user confirmation) ─────────
    if (!nodeMdContent) {
        console.log("❌ node.md initialisation failed — no content from LLM.");
        return;
    }

    const nodeMdPath = join(nodePath, "node.md");
    writeFileSync(nodeMdPath, nodeMdContent + "\n", "utf-8");
    console.log("✅ node.md written to %s", nodeMdPath);
}
