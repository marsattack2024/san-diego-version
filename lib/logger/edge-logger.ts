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

// Deduplication settings - only active in development mode
const DEDUP_SETTINGS = {
  interval: 10000, // 10 seconds between identical logs
  expiryTime: 60000, // Clear duplicates after 1 minute
  showCounts: true, // Show counts of suppressed logs
};

// Helper function to handle log deduplication
function shouldLogMessage(level: string, message: string, data?: any): { shouldLog: boolean, count: number } {
  // Skip deduplication in production or for error logs
  if (process.env.NODE_ENV === 'production' || level === 'error') {
    return { shouldLog: true, count: 1 };
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

export const edgeLogger = {
  debug(message: string, data?: any) {
    // Skip debug logs in production
    if (process.env.NODE_ENV === 'production') return;
    
    // Skip redundant logs
    const { shouldLog, count } = shouldLogMessage('debug', message, data);
    if (!shouldLog) return;
    
    // Add count to repeated messages
    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }
    
    console.log(JSON.stringify({
      level: 'debug',
      message: logMessage,
      ...cleanupLogData(data),
      timestamp: new Date().toISOString()
    }));
  },
  
  info(message: string, data?: any) {
    // Skip redundant logs in development
    const { shouldLog, count } = shouldLogMessage('info', message, data);
    if (!shouldLog) return;
    
    // Add count to repeated messages
    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }
    
    // Filter out verbose logs in development unless important
    if (process.env.NODE_ENV === 'development' && 
        !(data && data.important === true) && 
        (message.includes('Application started') || 
         message.includes('fetching chat history') ||
         message.includes('User authenticated') ||
         message.includes('Middleware request'))) {
      return; // Skip non-important routine logs in development
    }
    
    console.log(JSON.stringify({
      level: 'info',
      message: logMessage,
      ...cleanupLogData(data),
      timestamp: new Date().toISOString()
    }));
  },
  
  warn(message: string, data?: any) {
    // Skip redundant logs
    const { shouldLog, count } = shouldLogMessage('warn', message, data);
    if (!shouldLog) return;
    
    // Add count to repeated messages
    let logMessage = message;
    if (count > 1 && DEDUP_SETTINGS.showCounts) {
      logMessage = `${message} (repeated ${count} times)`;
    }
    
    console.log(JSON.stringify({
      level: 'warn',
      message: logMessage,
      ...cleanupLogData(data),
      timestamp: new Date().toISOString()
    }));
  },
  
  error(message: string | Error, data?: any) {
    console.error(`[Edge] ${message instanceof Error ? message.message : message}`, {
      ...(data || {}),
      stack: message instanceof Error ? message.stack : undefined
    });
  }
}; 