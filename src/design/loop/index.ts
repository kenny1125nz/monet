import { createInterface } from "node:readline";
import { resolve, normalize } from "node:path";
import { existsSync, statSync } from "node:fs";
import { logger } from "../../shared/logger.js";
import type { DesignToolSet } from "../types.js";
import { viewNode, listSubDirectories } from "../view/index.js";
import { initNode } from "../init/index.js";
import { decomposeNode } from "../decompose/index.js";
import { applyFlow } from "../apply/index.js";

/**
 * Resolve a `cd` target relative to the current node path.
 * Supports: `..`, relative paths, and absolute paths.
 * Returns the resolved absolute path, or null if the target doesn't exist.
 */
function resolveCdTarget(currentNode: string, target: string): string | null {
    // Absolute path — use as-is
    if (target.startsWith("/")) {
        const resolved = normalize(target);
        if (existsSync(resolved) && statSync(resolved).isDirectory()) {
            return resolved;
        }
        return null;
    }

    // Relative path — resolve from current node
    const resolved = normalize(resolve(currentNode, target));
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
        return resolved;
    }
    return null;
}

/**
 * Format a prompt label showing the current node path.
 */
function formatNodePrompt(currentNode: string): string {
    return `monet design [${currentNode}]> `;
}

/**
 * Run the `monet design` continuous CLI loop.
 * The human prompts and the AI proposes decompositions by writing/updating node.md files.
 *
 * @param tools - Scoped toolset for the design AI
 * @param startNode - Absolute path of the starting designing node (defaults to cwd)
 */
export async function runDesignLoop(tools: DesignToolSet, startNode?: string): Promise<void> {
    // Track the current designing node — this is the node scope, not the shell's cwd
    let currentNode = startNode ? normalize(startNode) : process.cwd();

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: formatNodePrompt(currentNode),
    });

    logger.info("Entering design loop. Type 'exit' to quit, 'help' for commands.");
    logger.info("Current designing node: %s", currentNode);

    rl.prompt();

    for await (const line of rl) {
        const input = line.trim();

        if (input === "" || input.startsWith("#")) {
            rl.prompt();
            continue;
        }

        if (input === "exit" || input === "quit") {
            logger.info("Exiting design loop.");
            break;
        }

        if (input === "help") {
            console.log(`
Commands:
  exit / quit       Exit the design loop
  help              Show this help message
  cd <path>         Switch the current designing node
                      cd ..              — move up to parent
                      cd <relative-path> — move to child/sibling
                      cd <absolute-path> — move to any directory
  pwd               Show the current designing node path
  list              List sub-nodes (child directories) of the current node
  view              Display the design view of the current node
  init              Initialise a node.md for the current node (asks questions, requests LLM proposal)
  validate          Run structural + type validation (detects stale nodes)
  decompose         Analyse Responsibility and propose child node breakdown
  apply             Materialise the ## Flow graph into the filesystem (create dirs + node.md files)
  freeze            Run full validation and freeze the design tree
  <prompt>          Any other input is sent to the AI for design proposals
`);
            rl.prompt();
            continue;
        }

        // ── cd command: switch the current designing node ──────────────────
        if (input.startsWith("cd ")) {
            const target = input.slice(3).trim();
            if (!target) {
                console.log("Usage: cd <path>");
                rl.prompt();
                continue;
            }

            const resolved = resolveCdTarget(currentNode, target);
            if (resolved === null) {
                console.log(`cd: no such directory: ${target}`);
            } else {
                currentNode = resolved;
                rl.setPrompt(formatNodePrompt(currentNode));
                logger.info("Switched to designing node: %s", currentNode);
            }
            rl.prompt();
            continue;
        }

        // ── pwd command: show current node path ────────────────────────────
        if (input === "pwd") {
            console.log(currentNode);
            rl.prompt();
            continue;
        }

        // ── validate command: run structural + type validation ────────────────
        // Also detects stale nodes by checking if previously-frozen nodes have
        // diverged from their prior git version.
        if (input === "validate") {
            const result = await tools.runValidate();
            if (result.valid) {
                console.log("✓ Validation passed");
            } else {
                console.log("✗ Validation failed:");
                for (const err of result.errors) {
                    console.log(`  - ${err}`);
                }
            }
            rl.prompt();
            continue;
        }

        // ── list command: show sub-nodes (child directories) of current node ──
        if (input === "list") {
            const subNodes = listSubDirectories(currentNode);
            if (subNodes.length > 0) {
                console.log("Sub-nodes of %s:", currentNode);
                for (const child of subNodes) {
                    console.log("  📁 %s", child);
                }
            } else {
                console.log("(no sub-nodes)");
            }
            rl.prompt();
            continue;
        }

        // ── view command: display the design view of the current node ─────────
        if (input === "view") {
            await viewNode(currentNode);
            rl.prompt();
            continue;
        }

        // ── init command: initialise a node.md for the current node ───────────
        // Usage: init              — interactive mode (asks questions)
        //        init <spec.md>    — read spec from markdown file (relative to current node)
        if (input.startsWith("init ")) {
            const specFile = input.slice(5).trim();
            await initNode(currentNode, specFile);
            rl.prompt();
            continue;
        }

        if (input === "init") {
            await initNode(currentNode, "");
            rl.prompt();
            continue;
        }

        // ── decompose command: analyse Responsibility and propose child breakdown ──
        // Triggers the AI to analyse the current node's ## Responsibility and
        // propose a child node breakdown: creates or updates child node.md files
        // with draft ## Responsibility, ## Interface, and ## Imports sections.
        if (input === "decompose") {
            logger.info("Decomposing node: %s", currentNode);
            await decomposeNode(currentNode);
            rl.prompt();
            continue;
        }

        // ── apply command: materialise the ## Flow graph into the filesystem ─────
        // Reads the ## Flow block of the current node and creates a directory
        // for each node listed in the flow graph that does not already exist,
        // seeding it with a minimal node.md.
        // Idempotent — safe to re-run after editing the flow.
        if (input === "apply") {
            logger.info("Applying flow for node: %s", currentNode);
            await applyFlow(currentNode);
            rl.prompt();
            continue;
        }

        // ── freeze command: run full validation and freeze the design tree ────────
        // Runs full validation; if it passes, stamps frozen:true and wave:N
        // into each node's frontmatter.
        if (input === "freeze") {
            logger.info("Freezing design tree from node: %s", currentNode);
            console.log("Freeze not yet implemented — will run validation and stamp frontmatter.");
            rl.prompt();
            continue;
        }

        // Otherwise, send the prompt to the AI for design proposals
        logger.info("Processing design prompt: %s", input);
        console.log("AI design processing not yet implemented.");
        rl.prompt();
    }

    rl.close();
}
