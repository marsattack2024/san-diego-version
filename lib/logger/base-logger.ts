/**
 * Simplified logger optimized for Vercel deployment
 * Uses JSON structured logging for better searchability in Vercel dashboard
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, any>;

export const logger = {
  debug: (message: string, context: LogContext = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify({ 
        level: 'debug', 
        message, 
        ...context, 
        timestamp: new Date().toISOString() 
      }));
    }
  },
  
  info: (message: string, context: LogContext = {}) => {
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
  
  warn: (message: string, context: LogContext = {}) => {
    console.warn(JSON.stringify({ 
      level: 'warn', 
      message, 
      ...context, 
      timestamp: new Date().toISOString() 
    }));
  },
  
  error: (message: string, context: LogContext = {}) => {
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