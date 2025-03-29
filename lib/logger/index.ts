import { edgeLogger } from './edge-logger';
import { clientLogger } from './client-logger';
import { chatLogger } from './chat-logger';
import { titleLogger } from './title-logger';
import { LogContext, getContext, withContext, startRequest, endRequest } from './context';

// Export types
export type { LogContext };

// Export context utilities
export { getContext, withContext, startRequest, endRequest };

// Export specialized loggers
export { chatLogger, titleLogger };

// Export consolidated loggers
export const logger = {
  // Server-side logging (uses edge-logger)
  server: edgeLogger,
  
  // Client-side logging
  client: clientLogger,
  
  // Specialized loggers
  chat: chatLogger,
  title: titleLogger,
  
  // Convenience methods that automatically use the right logger based on environment
  debug: (message: string, context = {}) => {
    if (typeof window === 'undefined') {
      edgeLogger.debug(message, { ...getContext(), ...context });
    } else {
      clientLogger.debug(message, context);
    }
  },
  
  info: (message: string, context = {}) => {
    if (typeof window === 'undefined') {
      edgeLogger.info(message, { ...getContext(), ...context });
    } else {
      clientLogger.info(message, context);
    }
  },
  
  warn: (message: string, context = {}) => {
    if (typeof window === 'undefined') {
      edgeLogger.warn(message, { ...getContext(), ...context });
    } else {
      clientLogger.warn(message, context);
    }
  },
  
  error: (message: string, context = {}) => {
    if (typeof window === 'undefined') {
      edgeLogger.error(message, { ...getContext(), ...context });
    } else {
      clientLogger.error(message, context);
    }
  },
  
  // Operation tracking (server-side only)
  trackOperation: edgeLogger.trackOperation,
  startBatch: edgeLogger.startBatch,
  
  // Request timing helpers
  startRequest,
  endRequest
};

// Default export for convenience
export default logger;
