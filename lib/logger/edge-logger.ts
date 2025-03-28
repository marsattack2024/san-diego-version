/**
 * Edge-compatible logger for middleware and edge functions
 * Features:
 * - Minimal implementation that works in Edge Runtime
 * - Basic log levels with environment awareness
 * - No dependencies on Node.js specific features
 */

import { type Message, type ToolSet } from 'ai';

// Log categories for grouping and sampling
const LOG_CATEGORIES = {
  AUTH: 'auth',
  CHAT: 'chat',
  TOOLS: 'tools',
  LLM: 'llm',
  SYSTEM: 'system'
} as const;

type LogCategory = typeof LOG_CATEGORIES[keyof typeof LOG_CATEGORIES];

// Add a log deduplication mechanism to reduce repeated logs
// At the top of the file, after imports but before any exported code

// Log deduplication cache
const LOG_CACHE = new Map<string, {
  count: number,
  lastLogTime: number,
  expiresAt: number
}>();

// Create a more robust singleton pattern using a global marker that survives reinitializations
// Define a unique key unlikely to collide with other properties
const STARTUP_LOG_KEY = '__APP_STARTUP_LOGGED_FLAG__';

// Detect globalThis across all environments
const globalObj: any = typeof globalThis !== 'undefined' ? globalThis :
  typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {};

// Initialize startup tracking flag
let hasLoggedStartup = false;

// Check if we've already logged startup in this or a previous instance
try {
  hasLoggedStartup = !!globalObj[STARTUP_LOG_KEY];
} catch (e) {
  // Ignore errors in case we're in a restricted environment
}

// Singleton pattern to track application startup state - key fix for duplicate logs
const APPLICATION_STATE = {
  startupLogged: hasLoggedStartup,
  startTime: Date.now()
};

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
  maxPerWindow: 5,  // Maximum occurrences to log per window
  // Add sampling rates per category
  samplingRates: {
    [LOG_CATEGORIES.AUTH]: 0.2,    // 20% of auth logs
    [LOG_CATEGORIES.CHAT]: 0.1,    // 10% of chat logs
    [LOG_CATEGORIES.TOOLS]: 0.1,   // 10% of tool logs
    [LOG_CATEGORIES.LLM]: 0.1,     // 10% of LLM logs
    [LOG_CATEGORIES.SYSTEM]: 1.0    // 100% of system logs
  }
};

// Add after the existing formatForConsole function
function formatDevLog(level: string, message: string, data: any = {}): string {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  // Simplify to three levels
  const emoji = level === 'error' ? '🔴' : level === 'warn' ? '🟠' : '🔵';

  // Extract important fields for the primary display
  const { durationMs, operation, sessionId, requestId, category, error, ...restData } = data;
  const primaryContext = [];

  if (category) primaryContext.push(category);
  if (durationMs) primaryContext.push(`${durationMs}ms`);
  if (operation) primaryContext.push(operation);

  // Format error information if present
  const errorInfo = error ? `\n  error: ${error.message || error}` : '';

  // Format remaining data more concisely
  const secondaryContext = Object.entries(restData)
    .filter(([k, v]) => k !== 'timestamp' && v !== undefined)
    .map(([k, v]) => {
      // Format arrays inline
      if (Array.isArray(v)) {
        return `  ${k}=[${v.join(', ')}]`;
      }
      // Format objects more concisely
      if (typeof v === 'object' && v !== null) {
        return `  ${k}=${JSON.stringify(v).replace(/\s+/g, ' ')}`;
      }
      return `  ${k}=${v}`;
    })
    .join('\n');

  return [
    `${emoji} ${timestamp} ${message}`,
    primaryContext.length ? ` (${primaryContext.join(', ')})` : '',
    errorInfo,
    secondaryContext ? `\n${secondaryContext}` : ''
  ].join('');
}

// Helper function to handle log deduplication
function shouldLogMessage(level: string, message: string, data?: LogData): { shouldLog: boolean, count: number } {
  // Always log errors and important messages
  if (level === 'error' || data?.important) {
    return { shouldLog: true, count: 1 };
  }

  // Apply category-based sampling in production
  if (process.env.NODE_ENV === 'production' && data?.category) {
    const samplingRate = DEDUP_SETTINGS.samplingRates[data.category] || 0.1;
    if (Math.random() > samplingRate) {
      return { shouldLog: false, count: 0 };
    }
  }

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

// We're now using the APPLICATION_STATE singleton pattern to track startup logging
// instead of firing logs at module initialization. This prevents duplicate logs
// that were occurring during serverless cold starts.

/**
 * Cleanup log data to ensure it's serializable and remove sensitive information
 */
function cleanupLogData(data?: any): Record<string, any> {
  if (!data || typeof data !== 'object') return {};

  const cleanData: Record<string, any> = {};

  Object.entries(data).forEach(([key, value]) => {
    // Skip functions
    if (typeof value === 'function') return;

    // Handle special cases
    if (key === 'error' && value instanceof Error) {
      cleanData[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
      return;
    }

    // Handle environment variables
    if (key === 'env' && value && typeof value === 'object') {
      cleanData[key] = maskEnvironmentVariables(value as Record<string, any>);
      return;
    }

    // Handle RPC parameters
    if (key === 'params' && value && typeof value === 'object') {
      cleanData[key] = maskRpcParams(value as Record<string, any>);
      return;
    }

    // Handle regular values
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      cleanData[key] = value;
      return;
    }

    // For arrays, clean each element
    if (Array.isArray(value)) {
      cleanData[key] = value.map(item =>
        item && typeof item === 'object' ? cleanupLogData(item) : item
      );
      return;
    }

    // For objects, clean recursively
    if (typeof value === 'object') {
      try {
        cleanData[key] = cleanupLogData(value);
      } catch (e) {
        cleanData[key] = '[Complex Object]';
      }
    }
  });

  return cleanData;
}

// Update the LogData interface to use LogOperation type
interface LogData {
  important?: boolean;
  error?: Error | string;
  userId?: string;
  sessionId?: string;
  category?: LogCategory;
  durationMs?: number;
  operation?: string;
  requestId?: string;
  timestamp?: string;
  path?: string;
  url?: string;
  batchId?: string;
  operations?: LogOperation[];
  slow?: boolean;
  ragOperationId?: string;
  parentOperationId?: string;
  [key: string]: any;
}

// Helper function to format logs for console output
function formatForConsole(level: string, message: string, data: any = {}): string {
  return process.env.NODE_ENV === 'development'
    ? formatDevLog(level, message, data)
    : JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() });
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

// Module-level flags and counters
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

// Define types for operation tracking
interface RagOperation {
  startTime: number;
  queryLength: number;
  queryPreview: string;
  requestId: string;
  parentId?: string;
  children: Set<string>;
  completed: boolean;
  status: 'running' | 'error' | 'completed';
}

// Production thresholds
export const THRESHOLDS = {
  RAG_TIMEOUT: 10000,      // 10 seconds
  SLOW_OPERATION: 2000,    // 2 seconds
  LOG_THRESHOLD: 1000,     // Only log operations > 1s in production
  IMPORTANT_THRESHOLD: 5000 // Mark as important if > 5s
};

// RAG operation tracking
const activeRagOperations = new Map<string, RagOperation>();

function startRagOperation(query: string, requestId: string, parentId?: string): string {
  const operationId = `rag-${Date.now().toString(36)}`;

  activeRagOperations.set(operationId, {
    startTime: performance.now(),
    // Security: Never store full query, only length and short preview
    queryLength: query.length,
    queryPreview: query.length > 20 ? query.substring(0, 20) + '...' : query,
    requestId,
    parentId,
    children: new Set(),
    completed: false,
    status: 'running'
  });

  if (parentId) {
    const parent = activeRagOperations.get(parentId);
    if (parent) {
      parent.children.add(operationId);
    }
  }

  return operationId;
}

function endRagOperation(operationId: string, status: 'error' | 'completed'): void {
  const operation = activeRagOperations.get(operationId);
  if (!operation) return;

  const duration = performance.now() - operation.startTime;
  operation.completed = true;
  operation.status = status;

  // Only remove the operation if it has no children or all children are completed
  const allChildrenCompleted = Array.from(operation.children).every(childId => {
    const child = activeRagOperations.get(childId);
    return child?.completed;
  });

  if (allChildrenCompleted) {
    activeRagOperations.delete(operationId);

    // If this operation has a parent, check if the parent can be cleaned up
    if (operation.parentId) {
      const parent = activeRagOperations.get(operation.parentId);
      if (parent) {
        parent.children.delete(operationId);
        if (parent.children.size === 0 && parent.completed) {
          activeRagOperations.delete(operation.parentId);
        }
      }
    }
  }
}

function checkStaleRagOperations(): void {
  const now = performance.now();

  for (const [operationId, operation] of activeRagOperations.entries()) {
    const duration = now - operation.startTime;

    // Only log timeouts for root operations or those without living parents
    const parent = operation.parentId ? activeRagOperations.get(operation.parentId) : null;
    const isOrphan = operation.parentId && !parent;
    const isRoot = !operation.parentId;

    if ((isRoot || isOrphan) && duration > THRESHOLDS.RAG_TIMEOUT && operation.status === 'running') {
      edgeLogger.warn('RAG operation timeout', {
        category: LOG_CATEGORIES.TOOLS,
        operationId,
        durationMs: Math.round(duration),
        resultsCount: 0,
        queryLength: operation.queryLength,
        requestId: operation.requestId,
        parentId: operation.parentId,
        childCount: operation.children.size,
        important: true,
        status: 'timeout',
        level: 'warn'
      });

      endRagOperation(operationId, 'error');
    }
  }
}

// Run cleanup every 5 seconds in production
if (process.env.NODE_ENV === 'production') {
  setInterval(checkStaleRagOperations, 5000);
}

// Define the EdgeLogger interface
interface EdgeLogger {
  startTimer: typeof startTimer;
  endTimer: typeof endTimer;
  generateRequestId: typeof generateRequestId;
  startGroup: (groupId: string) => void;
  addToGroup: (groupId: string, operation: string, data?: any) => void;
  endGroup: (groupId: string, message: string) => void;
  trackOperation: <T>(name: string, operation: () => Promise<T>, data?: LogData) => Promise<T>;
  startBatch: (batchId: string) => LogBatch;
  debug: (message: string, data?: LogData) => void;
  info: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  error: (message: string, data?: LogData) => void;
}

// Implement the logger functions
const startGroup = (groupId: string): void => {
  logGroups.set(groupId, {
    operations: {},
    startTime: performance.now()
  });
};

const addToGroup = (groupId: string, operation: string, data: any = {}): void => {
  const group = logGroups.get(groupId);
  if (!group) return;

  group.operations[operation] = {
    ...data,
    durationMs: Math.round(performance.now() - group.startTime)
  };
};

const endGroup = (groupId: string, message: string): void => {
  const group = logGroups.get(groupId);
  if (!group) return;

  const totalTime = Math.round(performance.now() - group.startTime);
  if (Object.keys(group.operations).length > 0) {
    const operations: LogOperation[] = Object.entries(group.operations).map(([name, data]) => ({
      name,
      timeMs: data.durationMs,
      ...data
    }));

    edgeLogger.info(message, {
      operations,
      totalTimeMs: totalTime,
      important: totalTime > 1000
    });
  }

  logGroups.delete(groupId);
};

const trackOperation = async <T>(
  name: string,
  operation: () => Promise<T>,
  data?: LogData
): Promise<T> => {
  const operationId = `${name}-${Date.now().toString(36)}`;
  const isRagOperation = name.toLowerCase().includes('rag');

  if (isRagOperation && data?.query) {
    const ragOpId = startRagOperation(
      data.query,
      data?.requestId || 'unknown',
      data?.parentOperationId
    );
    data.ragOperationId = ragOpId;
  }

  edgeLogger.startTimer(operationId);

  try {
    const result = await operation();
    const duration = edgeLogger.endTimer(operationId);

    if (isRagOperation && data?.ragOperationId) {
      endRagOperation(data.ragOperationId, 'completed');
    }

    return result;
  } catch (error) {
    const duration = edgeLogger.endTimer(operationId);

    if (isRagOperation && data?.ragOperationId) {
      endRagOperation(data.ragOperationId, 'error');
    }

    edgeLogger.error('RAG operation failed', {
      category: LOG_CATEGORIES.TOOLS,
      operation: name,
      operationId: data?.ragOperationId,
      durationMs: duration,
      resultsCount: 0,
      slow: duration > THRESHOLDS.SLOW_OPERATION,
      important: true,
      status: 'error',
      level: 'error',
      error: formatError(error),
      ...data
    });
    throw error;
  }
};

const startBatch = (batchId: string): LogBatch => {
  return new LogBatch(batchId);
};

const debug = (message: string, data?: LogData): void => {
  if (process.env.NODE_ENV === 'production') return;

  const { shouldLog, count } = shouldLogMessage('debug', message, data);
  if (!shouldLog) return;

  let logMessage = message;
  if (count > 1 && DEDUP_SETTINGS.showCounts) {
    logMessage = `${message} (repeated ${count} times)`;
  }

  // Add level field to data
  const enhancedData = {
    ...(data || {}),
    level: 'debug'
  };

  if (process.env.NODE_ENV === 'development') {
    console.log(formatDevLog('debug', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  } else {
    console.log(formatForConsole('debug', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  }
};

const info = (message: string, data?: LogData): void => {
  // Check if this is an application startup log and ensure we only log it once per process
  if (message === 'Application started') {
    // Return early if we've already logged startup in this process
    if (APPLICATION_STATE.startupLogged) return;

    // Set both local and global markers
    APPLICATION_STATE.startupLogged = true;

    // Set global marker to prevent logging in future instances
    try {
      globalObj[STARTUP_LOG_KEY] = true;
    } catch (e) {
      // Ignore errors in restricted environments
    }

    // Perform environment check to include in the startup log
    const envCheck = checkEnvironment();

    // Log a single, well-formatted startup message according to our standards
    console.log(formatForConsole('info', 'Application started', {
      level: 'info',
      category: LOG_CATEGORIES.SYSTEM,
      environment: process.env.NODE_ENV,
      region: process.env.VERCEL_REGION || 'local',
      version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      uptime: 0,
      ...envCheck,
      // Only mark startup as important if there's an issue with the environment
      important: !envCheck.valid
    }));
    return;
  }

  const { shouldLog, count } = shouldLogMessage('info', message, data);
  if (!shouldLog) return;

  let logMessage = message;
  if (count > 1 && DEDUP_SETTINGS.showCounts) {
    logMessage = `${message} (repeated ${count} times)`;
  }

  // Add level field to data
  const enhancedData = {
    ...(data || {}),
    level: 'info'
  };

  if (process.env.NODE_ENV === 'development') {
    console.log(formatDevLog('info', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  } else {
    console.log(formatForConsole('info', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  }
};

const warn = (message: string, data?: LogData): void => {
  const { shouldLog, count } = shouldLogMessage('warn', message, data);
  if (!shouldLog) return;

  let logMessage = message;
  if (count > 1 && DEDUP_SETTINGS.showCounts) {
    logMessage = `${message} (repeated ${count} times)`;
  }

  // Add level field to data
  const enhancedData = {
    ...(data || {}),
    level: 'warn'
  };

  if (process.env.NODE_ENV === 'development') {
    console.warn(formatDevLog('warn', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  } else {
    console.warn(formatForConsole('warn', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  }
};

const error = (message: string, data?: LogData): void => {
  const { count } = shouldLogMessage('error', message, data);

  let logMessage = message;
  if (count > 1 && DEDUP_SETTINGS.showCounts) {
    logMessage = `${message} (repeated ${count} times)`;
  }

  // Add level field to data
  const enhancedData = {
    ...(data || {}),
    level: 'error'
  };

  if (process.env.NODE_ENV === 'development') {
    console.error(formatDevLog('error', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  } else {
    console.error(formatForConsole('error', logMessage, cleanupLogData(maskSensitiveData(enhancedData))));
  }
};

// Export the edgeLogger implementation
export const edgeLogger: EdgeLogger = {
  startTimer,
  endTimer,
  generateRequestId,
  startGroup,
  addToGroup,
  endGroup,
  trackOperation,
  startBatch,
  debug,
  info,
  warn,
  error
} as const;

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

// Environment variable handling
function checkEnvironment(): { valid: boolean; summary: string } {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'OPENAI_API_KEY',
    'PERPLEXITY_API_KEY'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  const services = {
    database: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
    ai: process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? 'configured' : 'missing'
  };

  return {
    valid: missing.length === 0,
    summary: `services=${Object.entries(services).map(([k, v]) => `${k}:${v}`).join(',')}`
  };
}

function logEnvironmentCheck() {
  const envCheck = checkEnvironment();

  edgeLogger.info('Environment check', {
    category: LOG_CATEGORIES.SYSTEM,
    valid: envCheck.valid,
    summary: envCheck.summary,
    important: !envCheck.valid
  });
}

// Add a function to manually log the startup if needed in specific places
function logApplicationStartup() {
  // Only proceed if startup hasn't been logged yet
  if (!APPLICATION_STATE.startupLogged) {
    // Set both local and global markers
    APPLICATION_STATE.startupLogged = true;

    // Set global marker to prevent logging in future instances
    try {
      globalObj[STARTUP_LOG_KEY] = true;
    } catch (e) {
      // Ignore errors in restricted environments
    }

    // Perform environment check to include in the startup log
    const envCheck = checkEnvironment();

    // Log a single, well-formatted startup message according to our standards
    console.log(formatForConsole('info', 'Application started', {
      level: 'info',
      category: LOG_CATEGORIES.SYSTEM,
      environment: process.env.NODE_ENV,
      region: process.env.VERCEL_REGION || 'local',
      version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      uptime: 0,
      ...envCheck,
      // Only mark startup as important if there's an issue with the environment
      important: !envCheck.valid
    }));
  }
}

// Export the startup logging function
export { logApplicationStartup };

function maskEnvironmentVariables(env: Record<string, any>): Record<string, any> {
  // In production, only return service status
  if (process.env.NODE_ENV === 'production') {
    return {
      services: {
        database: env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
        ai: env.OPENAI_API_KEY && env.PERPLEXITY_API_KEY ? 'configured' : 'missing'
      }
    };
  }

  // In development, show minimal useful information
  return {
    services: {
      database: env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
      ai: env.OPENAI_API_KEY && env.PERPLEXITY_API_KEY ? 'configured' : 'missing'
    },
    development: {
      port: env.PORT,
      logLevel: env.LOG_LEVEL,
      nodeEnv: env.NODE_ENV
    }
  };
}

// Add RPC parameter masking to cleanupLogData
function maskRpcParams(params: Record<string, any>): Record<string, any> {
  const masked = { ...params };

  // Mask user IDs in RPC parameters
  if (masked.user_id) {
    masked.user_id = `${masked.user_id.substring(0, 4)}...${masked.user_id.slice(-4)}`;
  }

  // Mask session IDs
  if (masked.session_id) {
    masked.session_id = `${masked.session_id.substring(0, 4)}...${masked.session_id.slice(-4)}`;
  }

  return masked;
}

// Define operation types
type BatchOperation = {
  message: string;
  timestamp: number;
  data?: Record<string, any>;
};

type LogOperation = {
  name: string;
  timeMs?: number;
  duration?: number;
  data?: any;
  [key: string]: any;
};

// Update the batch operations type
const categoryBatches = new Map<LogCategory, {
  operations: BatchOperation[];
  startTime: number;
}>();

// Add category batching methods
function startCategoryBatch(category: LogCategory) {
  if (!categoryBatches.has(category)) {
    categoryBatches.set(category, {
      operations: [],
      startTime: performance.now()
    });
  }
}

function addToCategoryBatch(category: LogCategory, message: string, data?: any) {
  const batch = categoryBatches.get(category);
  if (batch) {
    batch.operations.push({
      message,
      timestamp: performance.now(),
      data
    });
  }
}

function flushCategoryBatch(category: LogCategory) {
  const batch = categoryBatches.get(category);
  if (!batch) return;

  const totalTime = Math.round(performance.now() - batch.startTime);
  if (batch.operations.length > 0) {
    const operations: LogOperation[] = batch.operations.map(op => ({
      name: op.message,
      timeMs: Math.round(op.timestamp - batch.startTime),
      duration: op.data?.duration,
      data: op.data,
      ...op.data
    }));

    logger.info(`${category} operations summary`, {
      category,
      operationCount: batch.operations.length,
      totalTimeMs: totalTime,
      operations
    });
  }

  categoryBatches.delete(category);
} 