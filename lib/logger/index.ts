import { logger as baseLogger, LogLevel, LogContext } from './base-logger';
import { clientLogger } from './client-logger';
import { logger as vectorLogger } from './vector-logger';
import { logger as aiLogger } from './ai-logger';
import { logger as apiLogger } from './api-logger';

// Export types
export type { LogLevel, LogContext };

// Export individual loggers
export { baseLogger, clientLogger, vectorLogger, aiLogger, apiLogger };

// Create a unified logger interface
export const loggers = {
  base: baseLogger,
  client: clientLogger,
  vector: vectorLogger,
  ai: aiLogger,
  api: apiLogger
};

// Export default logger factory for convenience
export const createLogger = (component: string) => ({
  debug: (message: string, context = {}) => clientLogger.debug(`[${component}] ${message}`, context),
  info: (message: string, context = {}) => clientLogger.info(`[${component}] ${message}`, context),
  warn: (message: string, context = {}) => clientLogger.warn(`[${component}] ${message}`, context),
  error: (message: string | Error, context = {}) => clientLogger.error(`[${component}] ${message}`, context)
});
