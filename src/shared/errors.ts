/**
 * Base error class for all Monet CLI errors.
 */
export class MonetError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly exitCode: number = 1,
    ) {
        super(message);
        this.name = "MonetError";
    }
}

export class ValidationError extends MonetError {
    constructor(message: string, code = "VALIDATION_ERROR") {
        super(message, code, 1);
        this.name = "ValidationError";
    }
}

export class ConfigError extends MonetError {
    constructor(message: string, code = "CONFIG_ERROR") {
        super(message, code, 1);
        this.name = "ConfigError";
    }
}

export class BuildError extends MonetError {
    constructor(message: string, code = "BUILD_ERROR") {
        super(message, code, 2);
        this.name = "BuildError";
    }
}

export class AgentError extends MonetError {
    constructor(message: string, code = "AGENT_ERROR") {
        super(message, code, 3);
        this.name = "AgentError";
    }
}
