/**
 * Edge-compatible logger for middleware and edge functions
 * Features:
 * - Minimal implementation that works in Edge Runtime
 * - Basic log levels with environment awareness
 * - No dependencies on Node.js specific features
 */

// Simple but effective logger for Vercel based on logging-rules.mdc
export const logger = {
  debug: (message: string, context = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify({ 
        level: 'debug', 
        message, 
        ...context, 
        timestamp: new Date().toISOString() 
      }));
    }
  },
  
  info: (message: string, context = {}) => {
    // In production, limit info logs to important operations
    if (process.env.NODE_ENV !== 'production' || context.important) {
      console.log(JSON.stringify({ 
        level: 'info', 
        message, 
        ...context, 
        timestamp: new Date().toISOString() 
      }));
    }
  },
  
  warn: (message: string, context = {}) => {
    console.warn(JSON.stringify({ 
      level: 'warn', 
      message, 
      ...context, 
      timestamp: new Date().toISOString() 
    }));
  },
  
  error: (message: string, context = {}) => {
    console.error(JSON.stringify({ 
      level: 'error', 
      message, 
      ...(context.error ? {
        errorMessage: context.error.message,
        stack: context.error.stack,
        name: context.error.name
      } : context),
      timestamp: new Date().toISOString() 
    }));
  }
};

// Log application startup (useful in Vercel logs)
if (typeof window === 'undefined') {
  logger.info('Application started', { 
    important: true,
    environment: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION
  });
}

export const edgeLogger = {
  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Edge] ${message}`, data || '');
    }
  },
  
  info(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.info(`[Edge] ${message}`, data || '');
    }
  },
  
  warn(message: string, data?: any) {
    console.warn(`[Edge] ${message}`, data || '');
  },
  
  error(message: string | Error, data?: any) {
    console.error(`[Edge] ${message instanceof Error ? message.message : message}`, {
      ...(data || {}),
      stack: message instanceof Error ? message.stack : undefined
    });
  }
}; 