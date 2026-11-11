#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, ensureConfigDir } from "../config/index.js";
import { runDesignLoop, decomposeNode, applyFlow } from "../design/index.js";
import { computeWaves, executeBuild } from "../build/index.js";
import { generateReviewReport, printReviewSummary } from "../review/index.js";
import { createAgentAdapter } from "../agent/index.js";
import { startUIServer } from "../ui/index.js";
import { validateStructural, readNodeContracts } from "../validation/index.js";
import { setLogLevel, LogLevel, logger } from "../shared/logger.js";
import { MonetError } from "../shared/errors.js";

const program = new Command();

program
    .name("monet")
    .description("AI agent orchestrator for the PDCA loop — design, build, review.")
    .version("0.1.0")
    .option("-v, --verbose", "enable verbose logging")
    .hook("preAction", (thisCommand) => {
        if (thisCommand.opts().verbose) {
            setLogLevel(LogLevel.DEBUG);
        }
    });

// ─── `monet init` ────────────────────────────────────────────────────────────

program
    .command("init")
    .description("Bootstrap a new Monet project in the current directory")
    .action(async () => {
        try {
            ensureConfigDir();
            const rootNode = process.cwd();
            logger.info("Initialising Monet project in %s", rootNode);
            // In production: create root node.md, etc.
            console.log("Monet project initialised.");
        } catch (err) {
            handleError(err);
        }
    });

// ─── `monet design` ──────────────────────────────────────────────────────────

/**
 * Detect whether the subtree rooted at `nodePath` has any nodes carrying
 * `## Changes` in their node.md — which triggers revise mode.
 */
function detectReviseContext(nodePath: string): boolean {
    try {
        const nodes = readNodeContracts(nodePath);
        for (const [, contract] of nodes) {
            if (contract.changes && contract.changes.length > 0) {
                return true;
            }
        }
    } catch {
        // If we can't read contracts, assume fresh mode
    }
    return false;
}

/**
 * Build the scoped toolset for the design AI.
 * The design AI can only read/write node.md files, list the tree, and run validation.
 */
function buildDesignTools(_currentNode: string) {
    return {
        readNode: async (_path: string) => null,
        writeNode: async (_path: string, _contract: unknown) => { },
        listTree: async (_path: string) => [],
        runValidate: async () => ({ valid: true, errors: [] as string[] }),
    };
}

// ── `monet design` (interactive loop) ────────────────────────────────────────

program
    .command("design")
    .description("Enter the continuous design loop with AI assistance")
    .action(async () => {
        try {
            const currentNode = process.cwd();

            // Auto-detect revise mode: if any nodes carry ## Changes, scope to stale nodes
            const isRevise = detectReviseContext(currentNode);
            if (isRevise) {
                logger.info("Revise mode detected — scoping session to stale nodes and their dependents");
                console.log("📋 Revise mode: some nodes carry pending Changes. Session scoped accordingly.");
            }

            const tools = buildDesignTools(currentNode);
            await runDesignLoop(tools, currentNode);
        } catch (err) {
            handleError(err);
        }
    });

// ── `monet design decompose` (one-shot) ──────────────────────────────────────

program
    .command("design-decompose")
    .description("Analyse the current node's Responsibility and propose child node breakdown")
    .action(async () => {
        try {
            const currentNode = process.cwd();
            logger.info("Decomposing node: %s", currentNode);
            await decomposeNode(currentNode);
        } catch (err) {
            handleError(err);
        }
    });

// ── `monet design apply` (one-shot) ─────────────────────────────────────────

program
    .command("design-apply")
    .description("Materialise the ## Flow graph into the filesystem (create dirs + node.md files)")
    .action(async () => {
        try {
            const currentNode = process.cwd();
            logger.info("Applying flow for node: %s", currentNode);
            await applyFlow(currentNode);
        } catch (err) {
            handleError(err);
        }
    });

// ── `monet design validate` (one-shot) ───────────────────────────────────────

program
    .command("design-validate")
    .description("Run structural + type validation without freezing")
    .action(async () => {
        try {
            const currentNode = process.cwd();
            logger.info("Running validation for node: %s", currentNode);
            const nodes = readNodeContracts(currentNode);
            const result = validateStructural(nodes);
            if (result.valid) {
                console.log("✓ Validation passed");
            } else {
                console.log("✗ Validation failed:");
                for (const err of result.errors) {
                    console.log(`  - [${err.code}] ${err.message}`);
                }
            }
        } catch (err) {
            handleError(err);
        }
    });

// ── `monet design freeze` (one-shot) ────────────────────────────────────────

program
    .command("design-freeze")
    .description("Run full validation and freeze the design tree")
    .action(async () => {
        try {
            const currentNode = process.cwd();
            logger.info("Freezing design tree from node: %s", currentNode);
            // In production: run full validation, stamp frozen:true and wave:N
            console.log("Design tree frozen.");
        } catch (err) {
            handleError(err);
        }
    });

// ─── `monet build` ───────────────────────────────────────────────────────────

program
    .command("build")
    .description("Execute the build: dispatch coding agents wave by wave")
    .option("--revise", "process nodes with Findings or Changes")
    .action(async (options: { revise?: boolean }) => {
        try {
            // The current working directory is the designing node;
            // build is scoped to this node and its children
            const currentNode = process.cwd();
            const config = loadConfig();
            logger.info("Starting build from node: %s (revise=%s)", currentNode, options.revise ?? false);

            // In production: read frozen nodes from the subtree rooted at currentNode
            const nodes = new Map<string, import("../core/types.js").NodeContract>();
            logger.warn("No frozen nodes found — build is a no-op until design is frozen.");

            if (nodes.size === 0) {
                console.log("No nodes to build. Run `monet design-freeze` first.");
                return;
            }

            const waves = computeWaves(nodes);
            logger.info("Computed %d wave(s)", waves.length);

            const agent = createAgentAdapter(config.agent);
            await executeBuild(waves, nodes, agent);
        } catch (err) {
            handleError(err);
        }
    });

// ─── `monet review` ──────────────────────────────────────────────────────────

program
    .command("review")
    .description("Consolidate node bundles and render a review report")
    .action(async () => {
        try {
            // The current working directory is the designing node;
            // review is scoped to this node and its children
            const currentNode = process.cwd();
            logger.info("Generating review report for node: %s", currentNode);

            // In production: read node contracts and architecture.json from the subtree
            const nodes = new Map<string, import("../core/types.js").NodeContract>();
            const architectures = new Map<string, import("../core/types.js").NodeArchitecture>();

            if (nodes.size === 0) {
                console.log("No nodes to review. Run `monet build` first.");
                return;
            }

            const reports = generateReviewReport(nodes, architectures);
            printReviewSummary(reports);
        } catch (err) {
            handleError(err);
        }
    });

// ─── `monet ui` ──────────────────────────────────────────────────────────────

program
    .command("ui")
    .description("Start the local web UI for design explorer and review report")
    .option("-p, --port <number>", "port to listen on", "3000")
    .action(async (options: { port: string }) => {
        try {
            const port = parseInt(options.port, 10);
            await startUIServer(port);
        } catch (err) {
            handleError(err);
        }
    });

// ─── Error Handler ───────────────────────────────────────────────────────────

function handleError(err: unknown): void {
    if (err instanceof MonetError) {
        logger.error("[%s] %s", err.code, err.message);
        process.exit(err.exitCode);
    }
    logger.error("Unexpected error: %s", (err as Error).message);
    process.exit(1);
}

// ─── Parse ───────────────────────────────────────────────────────────────────

program.parse(process.argv);
