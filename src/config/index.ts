import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MonetConfig } from "../core/types.js";
import { ConfigError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

const CONFIG_DIR = join(homedir(), ".monet");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: MonetConfig = {
    configDir: CONFIG_DIR,
    model: {
        provider: "anthropic",
        modelName: "claude-sonnet-4-20250514",
        apiKey: process.env.ANTHROPIC_API_KEY,
    },
    languagePack: "typescript",
    agent: {
        adapter: "aider",
        timeout: 300_000,
        maxRetries: 3,
    },
};

/**
 * Load the Monet configuration from ~/.monet/config.json.
 * Falls back to defaults if no config file exists.
 */
export function loadConfig(): MonetConfig {
    if (!existsSync(CONFIG_FILE)) {
        logger.info("No config file found at %s, using defaults", CONFIG_FILE);
        return { ...DEFAULT_CONFIG };
    }

    try {
        const raw = readFileSync(CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(raw) as Partial<MonetConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch (err) {
        throw new ConfigError(
            `Failed to parse config file at ${CONFIG_FILE}: ${(err as Error).message}`,
        );
    }
}

/**
 * Save the Monet configuration to ~/.monet/config.json.
 */
export function saveConfig(config: MonetConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }

    try {
        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
        logger.info("Config saved to %s", CONFIG_FILE);
    } catch (err) {
        throw new ConfigError(
            `Failed to write config file: ${(err as Error).message}`,
        );
    }
}

/**
 * Ensure the config directory exists.
 */
export function ensureConfigDir(): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
        logger.debug("Created config directory at %s", CONFIG_DIR);
    }
}
