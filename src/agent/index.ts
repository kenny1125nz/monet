import type { MonetAgentAdapter, NodeTask, TaskResult } from "../core/types.js";
import { AgentError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

interface AiderOptions {
    timeout: number;
    maxRetries: number;
    model?: string;
}

/**
 * Reference implementation of MonetAgentAdapter using Aider.
 * Aider is a CLI-native AI coding tool that supports OpenAI-compatible endpoints.
 */
export class AiderAgentAdapter implements MonetAgentAdapter {
    private readonly timeout: number;
    private readonly maxRetries: number;
    private readonly model: string | undefined;

    constructor(options: AiderOptions) {
        this.timeout = options.timeout;
        this.maxRetries = options.maxRetries;
        this.model = options.model;
        logger.debug(
            "AiderAgentAdapter initialised with timeout=%d, maxRetries=%d, model=%s",
            this.timeout,
            this.maxRetries,
            this.model ?? "default",
        );
    }

    async execute(task: NodeTask): Promise<TaskResult> {
        logger.debug("AiderAgent executing task for node: %s", task.node.path);

        try {
            // In production, this would shell out to `aider` with the appropriate
            // context bundle and working directory.
            //
            // Example:
            //   aider --model <model> --read node.md --read facades/*.ts --output-dir <workingDir>
            //
            // For now, this is a placeholder that returns a successful result.

            logger.info(
                "Aider agent would process node '%s' with %d import interfaces and %d completed facades",
                task.node.name,
                task.contextBundle.importInterfaces.size,
                task.contextBundle.completedFacades.size,
            );

            return {
                status: "done",
            };
        } catch (err) {
            throw new AgentError(
                `Aider agent failed for node ${task.node.path}: ${(err as Error).message}`,
            );
        }
    }
}

/**
 * Factory to create the appropriate agent adapter based on configuration.
 */
export function createAgentAdapter(config: {
    adapter: string;
    timeout: number;
    maxRetries: number;
    model?: string;
}): MonetAgentAdapter {
    switch (config.adapter) {
        case "aider":
            return new AiderAgentAdapter({
                timeout: config.timeout,
                maxRetries: config.maxRetries,
                model: config.model,
            });
        default:
            throw new AgentError(`Unknown agent adapter: ${config.adapter}`);
    }
}
