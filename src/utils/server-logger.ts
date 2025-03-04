import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

// Environment-aware configuration
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  timestamp: true,
  // Only pretty-print in development
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  })
});

/**
 * Create a logger with a specific namespace
 */
export function createLogger(namespace: string) {
  return logger.child({ namespace });
}

/**
 * Create a request-specific logger with request context
 */
export function createRequestLogger(req: any) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  return logger.child({ 
    requestId, 
    clientIp,
    userAgent,
    method: req.method,
    url: req.url
  });
}

// Define LogFn type for logger functions
type LogFn = (obj: object | string, msg?: string, ...args: any[]) => void;

// Define Logger interface
export interface Logger {
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  child: (bindings: object) => Logger;
} 