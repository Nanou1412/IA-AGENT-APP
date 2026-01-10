/**
 * Logger utility for the Realtime Server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
  
  if (data !== undefined) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
    return `${prefix} ${message} ${dataStr}`;
  }
  
  return `${prefix} ${message}`;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(context: string): Logger {
  return {
    debug(message: string, data?: unknown) {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', context, message, data));
      }
    },
    
    info(message: string, data?: unknown) {
      if (shouldLog('info')) {
        console.log(formatMessage('info', context, message, data));
      }
    },
    
    warn(message: string, data?: unknown) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', context, message, data));
      }
    },
    
    error(message: string, data?: unknown) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', context, message, data));
      }
    },
  };
}
