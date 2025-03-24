/**
 * Edge-compatible logger for middleware and edge functions
 * Features:
 * - Minimal implementation that works in Edge Runtime
 * - Basic log levels with environment awareness
 * - No dependencies on Node.js specific features
 */

// Add a log deduplication mechanism to reduce repeated logs
// At the top of the file, after imports but before any exported code

// Log deduplication cache
const LOG_CACHE = new Map<string, {
  count: number,
  lastLogTime: number,
  expiresAt: number
}>();

// Operation groups for related logging
const logGroups = new Map<string, {
  operations: Record<string, any>,
  startTime: number
}>();

// Deduplication settings - only active in development mode
const DEDUP_SETTINGS = {
  interval: 10000, // 10 seconds between identical logs
  expiryTime: 60000, // Clear duplicates after 1 minute
  showCounts: true, // Show counts of suppressed logs
  windowMs: 60000, // 1 minute window for deduplication
  maxPerWindow: 5  // Maximum occurrences to log per window
};

// Helper function to format logs for console output
function formatForConsole(level: string, message: string, data: any = {}): string {
  // Skip JSON formatting in development for better readability
  if (process.env.NODE_ENV === 'development') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // Just time HH:MM:SS
    let prefix = '';
    
    switch (level) {
      case 'error': prefix = '🔴'; break;
      case 'warn': prefix = '🟠'; break;
      case 'info': prefix = '🔵'; break;
      case 'debug': prefix = '⚪'; break;
    }
    
    // Format important contextual data
    const context = [];
    if (data.durationMs) context.push(`${data.durationMs}ms`);
    if (data.operation) context.push(data.operation);
    if (data.sessionId) context.push(`session:${data.sessionId}`);
    
    return `${prefix} ${timestamp} ${message} ${context.length ? `(${context.join(', ')})` : ''}`;
  }
  
  // Use JSON in production for structured logging
  return JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() });
}

// Add after the existing formatForConsole function
function formatDevLog(level: string, message: string, data: any = {}): string {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const emoji = level === 'error' ? '🔴' : level === 'warn' ? '🟠' : level === 'info' ? '🔵' : '⚪';
  
  // Extract important fields for the primary display
  const { durationMs, operation, sessionId, requestId, ...restData } = data;
  const primaryContext = [];
  
  if (durationMs) primaryContext.push(`${durationMs}ms`);
  if (operation) primaryContext.push(operation);
  if (sessionId) primaryContext.push(`session:${sessionId}`);
  if (requestId) primaryContext.push(`req:${requestId}`);
  
  // Format remaining data if any
  const secondaryContext = Object.entries(restData)
    .filter(([k, v]) => k !== 'timestamp' && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  
  return [
    `${emoji} ${timestamp} ${message}`,
    primaryContext.length ? ` (${primaryContext.join(', ')})` : '',
    secondaryContext ? `\n  ${secondaryContext}` : ''
  ].join('');
}

// Helper function to handle log deduplication
function shouldLogMessage(level: string, message: string, data?: LogData): { shouldLog: boolean, count: number } {
  // Skip deduplication in production or for error logs
  if (process.env.NODE_ENV === 'production' || level === 'error') {
    return { shouldLog: true, count: 1 };
  }
  
  // More aggressive filtering in development
  if (process.env.NODE_ENV === 'development' && !data?.important) {
    // Filter out noisy development logs
    if (message.includes('Cookie information') ||
        message.includes('Chat history fetch') ||
        message.includes('Middleware request') ||
        message.includes('Compiled') ||
        message.includes('Compiling')) {
      // Only log 1 in 5 Next.js compilation messages
      if (Math.random() > 0.2) {
        return { shouldLog: false, count: 0 };
      }
    }
  }
  
  // Create a cache key from the message and important data fields
  // Don't include timestamps or request IDs which change every time
  const keyParts = [level, message];
  
  if (data) {
    // Include only stable identifying information
    if (data.path) keyParts.push(data.path);
    if (data.operation) keyParts.push(data.operation);
    if (data.url) keyParts.push(data.url);
    if (data.userId) keyParts.push(data.userId);
    if (data.sessionId) keyParts.push(data.sessionId);
  }
  
  const cacheKey = keyParts.join('::');
  const now = Date.now();
  
  // Check if we have this log in cache
  if (LOG_CACHE.has(cacheKey)) {
    const entry = LOG_CACHE.get(cacheKey)!;
    
    // Check if enough time has passed to log again
    if (now - entry.lastLogTime < DEDUP_SETTINGS.interval) {
      // Update count and skip logging
      entry.count++;
      LOG_CACHE.set(cacheKey, entry);
      return { shouldLog: false, count: entry.count };
    }
    
    // Enough time has passed, log it again with count
    const count = entry.count;
    
    // Reset the entry
    LOG_CACHE.set(cacheKey, {
      count: 1,
      lastLogTime: now,
      expiresAt: now + DEDUP_SETTINGS.expiryTime
    });
    
    return { shouldLog: true, count };
  }
  
  // First time seeing this log
  LOG_CACHE.set(cacheKey, {
    count: 1,
    lastLogTime: now,
    expiresAt: now + DEDUP_SETTINGS.expiryTime
  });
  
  return { shouldLog: true, count: 1 };
}

// Clean up expired cache entries periodically
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of LOG_CACHE.entries()) {
      if (entry.expiresAt < now) {
        LOG_CACHE.delete(key);
      }
    }
  }, 60000); // Run cleanup every minute
}

// Simple but effective logger for Vercel based on logging-rules.mdc
interface LogContext {
  important?: boolean;
  error?: Error | string;
  [key: string]: any;
}

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
        errorMessage: context.error instanceof Error ? context.error.message : context.error,
        stack: context.error instanceof Error ? context.error.stack : undefined,
        name: context.error instanceof Error ? context.error.name : undefined
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

/**
 * Cleanup log data to ensure it's serializable and remove sensitive information
 */
function cleanupLogData(data?: any): Record<string, any> {
  if (!data) return {};
  
  const cleanData: Record<string, any> = {};
  
  // Copy safe properties
  Object.entries(data).forEach(([key, value]) => {
    // Skip functions and complex objects
    if (typeof value === 'function') return;
    
    // Handle errors specially
    if (key === 'error' && value instanceof Error) {
      cleanData[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
      return;
    }
    
    // Copy simple values directly
    if (
      value === null || 
      typeof value === 'string' || 
      typeof value === 'number' || 
      typeof value === 'boolean' ||
      Array.isArray(value)
    ) {
      cleanData[key] = value;
      return;
    }
    
    // For objects, stringify to avoid circular references
    try {
      cleanData[key] = JSON.parse(JSON.stringify(value));
    } catch (e) {
      cleanData[key] = `[Unstringifiable ${typeof value}]`;
    }
  });
  
  return cleanData;
}

interface LogData {
  important?: boolean;
  error?: Error | string;
  userId?: string;
  sessionId?: string;
  [key: string]: any;
}

// Add user ID masking function
function maskSensitiveData(data: LogData | undefined): LogData {
  if (!data) return {};
  
  const masked = { ...data };
  
  // Mask user IDs
  if (masked.userId) {
    masked.userId = `${masked.userId.substring(0, 4)}...${masked.userId.slice(-4)}`;
  }
  
  // Mask session IDs
  if (masked.sessionId) {
    masked.sessionId = `${masked.sessionId.substring(0, 4)}...${masked.sessionId.slice(-4)}`;
  }
  
  return masked;
}

// Update sampling rates for production
const SAMPLING_RATES = {
  trace: 0.01,   // 1% of trace logs
  debug: 0.01,   // 1% of debug logs (reduced from 5%)
  info: 0.1,     // 10% of info logs (reduced from 20%)
  warn: 1.0,     // 100% of warnings
  error: 1.0     // 100% of errors
};

// Module-level flags and counters
let hasLoggedStartup = false;
let requestCounter = 0;

// Performance monitoring
const startTimes = new Map<string, number>();

// Utility functions
const generateRequestId = () => `req-${++requestCounter}-${Date.now().toString(36)}`;

function startTimer(operationId: string): void {
  startTimes.set(operationId, performance.now());
}

function endTimer(operationId: string): number {
  const start = startTimes.get(operationId);
  if (!start) return 0;
  
  const duration = Math.round(performance.now() - start);
  startTimes.delete(operationId);
  return duration;
}

function formatError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function logResourceUsage(operation: string, data?: LogData): void {
  if (process.env.NODE_ENV === 'production' && Math.random() < 0.02) {
    const usage = {
      operation,
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION || 'unknown'
    };
    
    console.log(JSON.stringify({
      level: 'metric',
      message: 'Resource usage sample',
      ...usage,
      ...cleanupLogData(maskSensitiveData(data))
    }));
  }
}

// Add the LogBatch class before the edgeLogger export
class LogBatch {
  private operations: Array<{ name: string; duration: number; data?: any }> = [];
  private startTime: number;
  private batchId: string;

  constructor(batchId: string) {
    this.startTime = performance.now();
    this.batchId = batchId;
  }

  addOperation(name: string, data?: any) {
    this.operations.push({
      name,
      duration: Math.round(performance.now() - this.startTime),
      data
    });
  }

  complete(message: string, additionalData: Record<string, any> = {}) {
    const totalDuration = Math.round(performance.now() - this.startTime);
    edgeLogger.info(message, {
      batchId: this.batchId,
      operations: this.operations,
      totalDuration,
      ...additionalData,
      important: totalDuration > 1000
    });
  }

  error(message: string, error: Error, additionalData: Record<string, any> = {}) {
    const totalDuration = Math.round(performance.now() - this.startTime);
    edgeLogger.error(message, {
      batchId: this.batchId,
      operations: this.operations,
      totalDuration,
      error,
      ...additionalData
    });
  }
}

// Update the edgeLogger export to include batching
export const edgeLogger = {
  startTimer,
  endTimer,
  generateRequestId,

  startGroup(groupId: string): void {
    logGroups.set(groupId, {
      operations: {},
      startTime: performance.now()
    });
  },

  addToGroup(groupId: string, operation: string, data: any = {}): void {
    const group = logGroups.get(groupId);
    if (!group) return;
    
    group.operations[operation] = {
      ...data,
      durationMs: Math.round(performance.now() - group.startTime)
    };
  },

  endGroup(groupId: string, message: string): void {
    const group = logGroups.get(groupId);
    if (!group) return;
    
    const totalTime = Math.round(performance.now() - group.startTime);
    this.info(message, {
      operations: group.operations,
      totalTimeMs: totalTime,
      important: totalTime > 1000
    });
    
    logGroups.delete(groupId);
  },

  async trackOperation<T>(
    name: string, 
    operation: () => Promise<T>, 
    data?: LogData
  ): Promise<T> {
    const operationId = `${name}-${Date.now().toString(36)}`;
    this.startTimer(operationId);
    
    try {
      const result = await operation();
      const duration = this.endTimer(operationId);
      
      if (duration > 500) {
        this.info(`Operation completed: ${name}`, {
          operation: name,
          durationMs: duration,
          slow: duration > 1000,
          ...data
        });
      }
      
      return result;
    } catch (error) {
      const duration = this.endTimer(operationId);
      this.error(`Operation failed: ${name}`, {
        operation: name,
        durationMs: duration,
        error: formatError(error),
        ...data
      });
      throw error;
    }
  },

  startBatch(batchId: string): LogBatch {
    return new LogBatch(batchId);
  },

  // Update the debug method to use the new formatting in development
  debug(message: string, data?: LogData) {
    if (process.env.NODE_ENV === 'production') return;

    const { shouldLog, count } = shouldLogMessage('debug', message, data);
    if (!shouldLog) return;

    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(formatDevLog('debug', logMessage, cleanupLogData(maskSensitiveData(data))));
    } else {
      console.log(formatForConsole('debug', logMessage, cleanupLogData(maskSensitiveData(data))));
    }
  },

  info(message: string, data?: LogData) {
    if (message === 'Application started' && !hasLoggedStartup) {
      hasLoggedStartup = true;
      console.log(formatForConsole('info', 'Application started', {
        important: true,
        environment: process.env.NODE_ENV,
        region: process.env.VERCEL_REGION,
        version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev'
      }));
      return;
    }

    if (process.env.NODE_ENV === 'production' && !(data?.important === true)) {
      if (
        message.includes('Application started') ||
        message.includes('fetching chat history') ||
        message.includes('User authenticated') ||
        message.includes('Middleware request') ||
        message.includes('New event stream connection') ||
        message.includes('Chat history fetch results') ||
        message.includes('Chat session not found') ||
        (message.includes('GET') && !message.includes('error'))
      ) {
        return;
      }
    }

    const { shouldLog, count } = shouldLogMessage('info', message, data);
    if (!shouldLog) return;

    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(formatDevLog('info', logMessage, cleanupLogData(maskSensitiveData(data))));
    } else {
      console.log(formatForConsole('info', logMessage, cleanupLogData(maskSensitiveData(data))));
    }
  },

  warn(message: string, data?: LogData) {
    const { shouldLog, count } = shouldLogMessage('warn', message, data);
    if (!shouldLog) return;

    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(formatDevLog('warn', logMessage, cleanupLogData(maskSensitiveData(data))));
    } else {
      console.warn(formatForConsole('warn', logMessage, cleanupLogData(maskSensitiveData(data))));
    }
  },

  error(message: string, data?: LogData) {
    // Always log errors, but still track counts
    const { count } = shouldLogMessage('error', message, data);

    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }

    if (process.env.NODE_ENV === 'development') {
      console.error(formatDevLog('error', logMessage, cleanupLogData(maskSensitiveData(data))));
    } else {
      console.error(formatForConsole('error', logMessage, cleanupLogData(maskSensitiveData(data))));
    }
  }
};

// Middleware helper for request tracking
export function withRequestTracking(handler: any) {
  return async (req: any, res: any) => {
    const requestId = edgeLogger.generateRequestId();
    req.requestId = requestId;
    
    return edgeLogger.trackOperation(
      'request',
      () => handler(req, res),
      {
        requestId,
        path: req.url || req.path,
        method: req.method,
      }
    );
  };
} 