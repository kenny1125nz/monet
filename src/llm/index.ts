/**
 * LLM Abstraction Layer
 *
 * Provides a unified interface for interacting with different LLM providers.
 * Currently supports OpenAI SDK (and OpenAI-compatible providers like Ollama).
 * Supports context injection from markdown files in the `memories/` directory.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { generateText, generateObject as aiGenerateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "@ai-sdk/provider";
import { z } from "zod";
import type { ModelConfig } from "../core/types.js";
import { logger } from "../shared/logger.js";
import { AgentError } from "../shared/errors.js";

// ─── Memories directory resolution ───────────────────────────────────────────
// Resolves relative to the current working directory when the CLI command was
// fired. This works reliably in both development (tsx) and production (compiled
// JS) because the CLI is always invoked from the project root.
const MEMORIES_DIR = resolve(process.cwd(), "memories");



// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Configuration for a completion request.
 */
export interface CompletionOptions {
    /** The system prompt / system message */
    system?: string;
    /** The user prompt */
    prompt: string;
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature (0-2) */
    temperature?: number;
    /**
     * Names of memory files (without .md extension) from the `memories/` directory
     * to inject into the system prompt as context. E.g. `["root-context"]`.
     */
    context?: string[];
}

/**
 * Configuration for a structured object generation request.
 */
export interface ObjectGenerationOptions<T> {
    /** The system prompt / system message */
    system?: string;
    /** The user prompt */
    prompt: string;
    /** Zod schema for the output structure */
    schema: z.ZodType<T>;
    /**
     * Names of memory files (without .md extension) from the `memories/` directory
     * to inject into the system prompt as context. E.g. `["root-context"]`.
     */
    context?: string[];
}

/**
 * Result of a completion request.
 */
export interface CompletionResult {
    /** The generated text */
    text: string;
    /** Raw finish reason from the provider */
    finishReason: string;
    /** Usage statistics if available */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * Result of a structured object generation request.
 */
export interface ObjectGenerationResult<T> {
    /** The generated object */
    object: T;
    /** Raw finish reason from the provider */
    finishReason: string;
    /** Usage statistics if available */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// ─── Memory Loading ──────────────────────────────────────────────────────────

const memoryCache = new Map<string, string>();

/**
 * Load a memory file from the `memories/` directory.
 * Files are loaded once and cached for subsequent calls.
 *
 * @param name - The name of the memory file (without .md extension)
 * @returns The file content, or empty string if not found
 */
function loadMemory(name: string): string {
    if (memoryCache.has(name)) {
        return memoryCache.get(name)!;
    }

    try {
        const filePath = resolve(MEMORIES_DIR, `${name}.md`);
        const content = readFileSync(filePath, "utf-8");
        memoryCache.set(name, content);
        logger.debug("Loaded memory: %s (%d chars)", name, content.length);
        return content;
    } catch (err) {
        logger.warn("Failed to load memory '%s': %s", name, (err as Error).message);
        memoryCache.set(name, "");
        return "";
    }
}

/**
 * Build the system prompt with optional context injection from memory files.
 */
function buildSystemPrompt(system?: string, context?: string[]): string {
    const parts: string[] = [];

    if (context && context.length > 0) {
        for (const name of context) {
            const content = loadMemory(name);
            if (content) {
                if (parts.length > 0) {
                    parts.push("");
                    parts.push("---");
                    parts.push("");
                }
                parts.push(content);
            }
        }
    }

    if (system) {
        if (parts.length > 0) {
            parts.push("");
            parts.push("---");
            parts.push("");
        }
        parts.push(system);
    }

    return parts.join("\n");
}

// ─── Model Building ──────────────────────────────────────────────────────────

/**
 * Create a custom LanguageModelV1 for OpenAI-compatible providers (DeepSeek, Ollama, etc.)
 * that uses the raw Chat Completions API directly.
 * This bypasses @ai-sdk/openai v3's broken chat model response parsing.
 */
function createOpenAIChatModel(
    modelName: string,
    apiKey?: string,
    baseUrl?: string,
): LanguageModelV1 {
    const baseURL = (baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
    const url = `${baseURL}/chat/completions`;

    return {
        specificationVersion: "v1",
        provider: "openai.chat",
        modelId: modelName,
        defaultObjectGenerationMode: "json",

        async doGenerate(options: any) {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            };

            const messages: any[] = [];
            if (options.system) {
                messages.push({ role: "system", content: options.system });
            }
            for (const msg of options.prompt) {
                if (msg.role === "user") {
                    const content = msg.content
                        .filter((c: any) => c.type === "text")
                        .map((c: any) => c.text)
                        .join("");
                    messages.push({ role: "user", content });
                } else if (msg.role === "assistant") {
                    const content = msg.content
                        .filter((c: any) => c.type === "text")
                        .map((c: any) => c.text)
                        .join("");
                    messages.push({ role: "assistant", content: content || null });
                } else if (msg.role === "tool") {
                    messages.push({
                        role: "tool",
                        content: msg.content.map((c: any) => ({
                            type: "tool_result",
                            tool_use_id: c.toolCallId,
                            content: c.result,
                        })),
                    });
                }
            }

            const body: Record<string, any> = {
                model: modelName,
                messages,
                max_tokens: options.maxOutputTokens ?? 4096,
                temperature: options.temperature,
                top_p: options.topP,
                frequency_penalty: options.frequencyPenalty,
                presence_penalty: options.presencePenalty,
                stop: options.stopSequences,
                stream: false,
            };

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: options.abortSignal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new AgentError(
                    `OpenAI API error (${response.status}): ${errorText}`,
                    "LLM_API_ERROR",
                );
            }

            const data = await response.json() as {
                choices?: Array<{
                    message?: { content?: string | null };
                    finish_reason?: string;
                }>;
                usage?: {
                    prompt_tokens?: number;
                    completion_tokens?: number;
                    total_tokens?: number;
                };
            };
            const choice = data.choices?.[0];
            const text = choice?.message?.content ?? "";

            return {
                text,
                finishReason: {
                    unified: choice?.finish_reason === "stop" ? "stop" : "unknown",
                    raw: choice?.finish_reason,
                },
                usage: data.usage
                    ? {
                        promptTokens: data.usage.prompt_tokens ?? 0,
                        completionTokens: data.usage.completion_tokens ?? 0,
                        totalTokens: data.usage.total_tokens ?? 0,
                    }
                    : undefined,
            };
        },
    } as unknown as LanguageModelV1;
}

/**
 * Build a language model instance from the Monet configuration.
 * Currently supports:
 *   - OpenAI-compatible providers (DeepSeek, Ollama, etc.) via raw Chat Completions API
 *   - Anthropic SDK (anthropic provider)
 *
 * @param modelConfig - The model configuration from Monet config
 * @returns A model instance compatible with the Vercel AI SDK
 */
export function buildModel(modelConfig: ModelConfig): LanguageModelV1 {
    const { provider, modelName, apiKey, baseUrl } = modelConfig;

    switch (provider) {
        case "openai":
        case "ollama": {
            // Use a custom implementation that calls the Chat Completions API directly.
            // This avoids @ai-sdk/openai v3's broken response parsing for third-party providers.
            return createOpenAIChatModel(modelName, apiKey, baseUrl);
        }
        case "anthropic": {
            const anthropic = createAnthropic({
                apiKey,
                baseURL: baseUrl,
            });
            return anthropic(modelName) as unknown as LanguageModelV1;
        }
        default: {
            throw new AgentError(
                `Unsupported LLM provider: ${provider}. Supported providers: openai, anthropic, ollama`,
                "UNSUPPORTED_PROVIDER",
            );
        }
    }
}

// ─── Completion ──────────────────────────────────────────────────────────────

/**
 * Generate a text completion from the configured LLM.
 *
 * This is the primary entry point for all LLM text generation in Monet.
 * It handles:
 *   - Model instantiation from config
 *   - Context injection from memory files (when specified)
 *   - Error handling with structured error types
 *
 * @param modelConfig - The model configuration
 * @param options - Completion options (prompt, system, context, etc.)
 * @returns The completion result
 */
export async function generateCompletion(
    modelConfig: ModelConfig,
    options: CompletionOptions,
): Promise<CompletionResult> {
    const {
        system,
        prompt,
        maxTokens,
        temperature,
        context,
    } = options;

    const model = buildModel(modelConfig);
    const systemPrompt = buildSystemPrompt(system, context);

    logger.info(
        "LLM completion: provider=%s model=%s context=%s",
        modelConfig.provider,
        modelConfig.modelName,
        context ? context.join(", ") : "none",
    );

    try {
        const result = await generateText({
            model,
            system: systemPrompt || undefined,
            prompt,
            maxTokens,
            temperature,
        });

        logger.debug(
            "LLM completion received: %d chars, finishReason=%s",
            result.text.length,
            result.finishReason,
        );

        return {
            text: result.text.trim(),
            finishReason: result.finishReason,
            usage: result.usage
                ? {
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                }
                : undefined,
        };
    } catch (err) {
        const message = (err as Error).message;
        logger.error("LLM completion failed: %s", message);
        throw new AgentError(
            `LLM completion failed (${modelConfig.provider}/${modelConfig.modelName}): ${message}, ${JSON.stringify(model)}`,
            "LLM_COMPLETION_ERROR",
        );
    }
}

// ─── Structured Object Generation ────────────────────────────────────────────

/**
 * Generate a structured object from the configured LLM.
 *
 * Uses the Vercel AI SDK's `generateObject` to produce type-safe,
 * schema-validated output. Supports context injection from memory files.
 *
 * @param modelConfig - The model configuration
 * @param options - Object generation options (prompt, schema, context, etc.)
 * @returns The generated object and metadata
 */
export async function generateObject<T>(
    modelConfig: ModelConfig,
    options: ObjectGenerationOptions<T>,
): Promise<ObjectGenerationResult<T>> {
    const {
        system,
        prompt,
        schema,
        context,
    } = options;

    const model = buildModel(modelConfig);
    const systemPrompt = buildSystemPrompt(system, context);

    logger.info(
        "LLM object generation: provider=%s model=%s context=%s",
        modelConfig.provider,
        modelConfig.modelName,
        context ? context.join(", ") : "none",
    );

    try {
        const result = await aiGenerateObject({
            model,
            system: systemPrompt || undefined,
            prompt,
            schema,
        });

        logger.debug(
            "LLM object generation received: finishReason=%s",
            result.finishReason,
        );

        return {
            object: result.object,
            finishReason: result.finishReason,
            usage: result.usage
                ? {
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                }
                : undefined,
        };
    } catch (err) {
        const message = (err as Error).message;
        logger.error("LLM object generation failed: %s", message);
        throw new AgentError(
            `LLM object generation failed (${modelConfig.provider}/${modelConfig.modelName}): ${message}`,
            "LLM_OBJECT_GENERATION_ERROR",
        );
    }
}
