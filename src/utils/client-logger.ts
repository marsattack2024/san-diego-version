import log from 'loglevel';
import { v4 as uuidv4 } from 'uuid';

// Generate a unique session ID for this browser session
const sessionId = uuidv4();

// Configure based on environment
if (process.env.NODE_ENV === 'production') {
  log.setLevel('warn');
} else {
  // Ensure we use a valid LogLevelDesc type
  log.setLevel((process.env.LOG_LEVEL as log.LogLevelDesc) || 'debug');
}

// Queue for batching logs in production
const logQueue: any[] = [];
const MAX_QUEUE_SIZE = 10;
const FLUSH_INTERVAL = 5000; // 5 seconds
let flushTimer: NodeJS.Timeout | null = null;

// Sampling rates for different log levels (production only)
const samplingRates = {
  trace: 0.01,  // 1% of trace logs
  debug: 0.05,  // 5% of debug logs
  info: 0.2,    // 20% of info logs
  warn: 1.0,    // 100% of warnings
  error: 1.0    // 100% of errors
};

// Standard fields that should be included in all logs
interface StandardLogFields {
  timestamp: string;
  level: string;
  sessionId: string;
  namespace: string;
  url?: string;
  userId?: string;
  // Add other standard fields as needed
}

/**
 * Create a logger with a specific context
 */
export function createLogger(namespace: string) {
  const contextLogger = log.getLogger(namespace);
  
  // Wrap the logger methods to add context and formatting
  const wrappedLogger = {
    trace: (message: any, ...args: any[]) => logWithContext(contextLogger.trace, 'trace', namespace, message, ...args),
    debug: (message: any, ...args: any[]) => logWithContext(contextLogger.debug, 'debug', namespace, message, ...args),
    info: (message: any, ...args: any[]) => logWithContext(contextLogger.info, 'info', namespace, message, ...args),
    warn: (message: any, ...args: any[]) => logWithContext(contextLogger.warn, 'warn', namespace, message, ...args),
    error: (message: any, ...args: any[]) => logWithContext(contextLogger.error, 'error', namespace, message, ...args),
    
    // Create a child logger with additional context
    child: (childContext: Record<string, any>) => {
      const childNamespace = Object.entries(childContext)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
      
      return createLogger(`${namespace}[${childNamespace}]`);
    }
  };
  
  return wrappedLogger;
}

/**
 * Determine if a log should be sampled based on level
 */
function shouldSample(level: string): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true; // Always log in non-production
  }
  
  const rate = samplingRates[level as keyof typeof samplingRates] || 1.0;
  return Math.random() < rate;
}

/**
 * Log a message with context
 */
function logWithContext(
  logFn: (...args: any[]) => void,
  level: string,
  namespace: string,
  message: any,
  ...args: any[]
) {
  // Skip logging based on sampling
  if (!shouldSample(level)) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const url = typeof window !== 'undefined' ? window.location.href : undefined;
  
  // If message is an object, treat it as structured logging data
  if (message && typeof message === 'object') {
    const { action, ...data } = message;
    const logMessage = args[0] || '';
    
    // Standard fields for all logs
    const standardFields: StandardLogFields = {
      timestamp,
      level,
      sessionId,
      namespace,
      url
    };
    
    // Format as JSON for structured logging
    const structuredLog = {
      ...standardFields,
      message: logMessage,
      action,
      ...data
    };
    
    // In production, queue logs for batching
    if (process.env.NODE_ENV === 'production' && level !== 'trace' && level !== 'debug') {
      queueLog(structuredLog, level);
    } else {
      // In development, log immediately
      logFn(JSON.stringify(structuredLog));
    }
  } else {
    // Simple string message
    const formattedMessage = `[${timestamp}] [${level}] [${namespace}] [${sessionId}] ${message}`;
    
    // In production, queue logs for batching
    if (process.env.NODE_ENV === 'production' && level !== 'trace' && level !== 'debug') {
      queueLog({
        timestamp,
        level,
        sessionId,
        namespace,
        url,
        message
      }, level);
    } else {
      // In development, log immediately
      logFn(formattedMessage, ...args);
    }
  }
}

/**
 * Queue a log for batch processing
 */
function queueLog(logData: any, level: string) {
  logQueue.push({
    ...logData,
    level,
    timestamp: logData.timestamp || new Date().toISOString()
  });
  
  // If queue is full, flush immediately
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    flushLogs();
    return;
  }
  
  // Set up a timer to flush logs if not already set
  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, FLUSH_INTERVAL);
  }
}

/**
 * Flush queued logs to the server
 */
function flushLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  
  if (logQueue.length === 0) {
    return;
  }
  
  const logsToSend = [...logQueue];
  logQueue.length = 0;
  
  // Only send logs if we're in a browser environment
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_REMOTE_LOGGING === 'true') {
    fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logsToSend),
      // Use keepalive to ensure logs are sent even during page transitions
      keepalive: true
    }).catch(() => {
      // If sending fails, don't retry to avoid affecting user experience
      console.warn('Failed to send logs to server');
    });
  }
}

// Ensure logs are sent when user leaves
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushLogs);
  
  // Also flush periodically
  setInterval(flushLogs, 30000); // Every 30 seconds
}

// Business event logging
export const businessEvents = {
  chatStarted: (userId?: string, agentType?: string) => {
    const logger = createLogger('business:events');
    logger.info({
      event: 'chat_started',
      userId,
      agentType,
      timestamp: new Date().toISOString()
    }, 'New chat conversation started');
  },
  
  messageSent: (userId?: string, messageLength?: number, agentType?: string) => {
    const logger = createLogger('business:events');
    logger.info({
      event: 'message_sent',
      userId,
      messageLength,
      agentType,
      timestamp: new Date().toISOString()
    }, 'User message sent');
  },
  
  deepSearchPerformed: (userId?: string, query?: string, resultCount?: number) => {
    const logger = createLogger('business:events');
    logger.info({
      event: 'deep_search_performed',
      userId,
      queryLength: query?.length,
      resultCount,
      timestamp: new Date().toISOString()
    }, 'Deep search performed');
  },
  
  chatDeleted: (userId?: string, messageCount?: number, conversationId?: string, title?: string) => {
    const logger = createLogger('business:events');
    logger.info({
      event: 'chat_deleted',
      userId,
      messageCount,
      conversationId,
      title,
      timestamp: new Date().toISOString()
    }, 'Chat conversation deleted');
  },
  
  errorOccurred: (userId?: string, context?: string, errorMessage?: string, agentType?: string) => {
    const logger = createLogger('business:events');
    logger.warn({
      event: 'error_occurred',
      userId,
      context,
      errorMessage,
      agentType,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }, 'Error occurred during user interaction');
  }
};

export default log; 