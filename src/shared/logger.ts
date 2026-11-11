import chalk from "chalk";

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4,
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.INFO]: "INFO",
    [LogLevel.WARN]: "WARN",
    [LogLevel.ERROR]: "ERROR",
    [LogLevel.SILENT]: "SILENT",
};

let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
    currentLogLevel = level;
}

export function getLogLevel(): LogLevel {
    return currentLogLevel;
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level < currentLogLevel) return;

    const label = LOG_LEVEL_LABELS[level].padEnd(5);
    const timestamp = new Date().toISOString();

    switch (level) {
        case LogLevel.DEBUG:
            console.debug(chalk.gray(`[${timestamp}] [${label}] ${message}`), ...args);
            break;
        case LogLevel.INFO:
            console.info(chalk.cyan(`[${timestamp}] [${label}] ${message}`), ...args);
            break;
        case LogLevel.WARN:
            console.warn(chalk.yellow(`[${timestamp}] [${label}] ${message}`), ...args);
            break;
        case LogLevel.ERROR:
            console.error(chalk.red(`[${timestamp}] [${label}] ${message}`), ...args);
            break;
    }
}

export const logger = {
    debug: (msg: string, ...args: unknown[]) => log(LogLevel.DEBUG, msg, ...args),
    info: (msg: string, ...args: unknown[]) => log(LogLevel.INFO, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log(LogLevel.WARN, msg, ...args),
    error: (msg: string, ...args: unknown[]) => log(LogLevel.ERROR, msg, ...args),
};
