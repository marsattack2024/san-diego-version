import { logger, LogLevel, LogContext } from './base-logger';
import { clientLogger } from './client-logger';
import vectorLogger from './vector-logger';
import { logger as edgeLogger } from './edge-logger';
import { logger as aiLogger } from './ai-logger';

// Export types
export type { LogLevel, LogContext };

// Export individual loggers
export { 
  logger, 
  clientLogger,
  vectorLogger,
  edgeLogger,
  aiLogger
};

// Create a unified logger interface
export const loggers = {
  base: logger,
  client: clientLogger,
  vector: vectorLogger,
  ai: aiLogger,
  edge: edgeLogger
};

// Export default logger factory for convenience
export const createLogger = (component: string) => ({
  debug: (message: string, context = {}) => clientLogger.debug(`[${component}] ${message}`, context),
  info: (message: string, context = {}) => clientLogger.info(`[${component}] ${message}`, context),
  warn: (message: string, context = {}) => clientLogger.warn(`[${component}] ${message}`, context),
  error: (message: string | Error, context = {}) => clientLogger.error(`[${component}] ${message}`, context)
});
