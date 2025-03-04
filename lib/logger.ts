// Environment-aware logger utility
// Provides different logging behavior based on environment

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, any>;

interface Logger {
  debug: (message: string, data?: any) => void;
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  child: (context: LogContext) => Logger;
}

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

// Create the base logger
export const logger: Logger = {
  debug: (message: string, data?: any) => {
    if (isDev) {
      console.debug(`[DEBUG] ${message}`, data || '');
    }
  },
  
  info: (message: string, data?: any) => {
    console.info(`[INFO] ${message}`, data || '');
  },
  
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data || '');
  },
  
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error || '');
  },
  
  // Create a child logger with additional context
  child: (context: LogContext): Logger => {
    return {
      debug: (message: string, data?: any) => {
        if (isDev) {
          console.debug(`[DEBUG] ${message}`, { ...context, ...(data ? { data } : {}) });
        }
      },
      
      info: (message: string, data?: any) => {
        console.info(`[INFO] ${message}`, { ...context, ...(data ? { data } : {}) });
      },
      
      warn: (message: string, data?: any) => {
        console.warn(`[WARN] ${message}`, { ...context, ...(data ? { data } : {}) });
      },
      
      error: (message: string, error?: any) => {
        console.error(`[ERROR] ${message}`, { ...context, ...(error ? { error } : {}) });
      },
      
      // Support nested child loggers
      child: (additionalContext: LogContext): Logger => {
        return logger.child({ ...context, ...additionalContext });
      }
    };
  }
};

// Helper to create a request-specific logger
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}

// Helper to measure and log performance
export function measurePerformance<T>(name: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  
  logger.debug(`Performance: ${name} took ${duration.toFixed(2)}ms`);
  
  return result;
} 