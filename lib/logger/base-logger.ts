/**
 * Enhanced logger optimized for both development and production
 * 
 * Features:
 * - Development: Human-readable formatted logs with colors
 * - Production: JSON structured logging for Vercel dashboard
 * - Environment-aware behavior
 * - Structured context for all logs
 * - Pretty formatting for complex objects
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, any>;

// Detect environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';
const isServer = typeof window === 'undefined';

// ANSI color codes for development console
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};

/**
 * Format complex objects for better readability in development
 */
function formatForDevelopment(level: LogLevel, message: string, context: LogContext = {}): void {
  const timestamp = new Date().toISOString();
  
  // Extract special fields for better formatting
  const { error, documents, structuredOutput, ...restContext } = context;
  
  // Print the main log message with colors
  console[level === 'debug' ? 'debug' : level](
    `${colors[level]}[${level.toUpperCase()}]${colors.reset} ${colors.dim}${timestamp}${colors.reset} ${message}`
  );
  
  // Format and print context data if present
  if (Object.keys(restContext).length > 0) {
    console[level === 'debug' ? 'debug' : level](
      JSON.stringify(restContext, null, 2)
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n')
    );
  }
  
  // Special handling for document results with line breaks for readability
  if (documents && Array.isArray(documents)) {
    console[level === 'debug' ? 'debug' : level]('  Documents:');
    documents.forEach((doc, i) => {
      console[level === 'debug' ? 'debug' : level](
        `    [${i+1}] ${doc.title || doc.id} (${doc.similarityPercent || Math.round(doc.similarity * 100)}%)\n` +
        `        ${doc.preview || doc.content?.substring?.(0, 100)}`
      );
    });
  }
  
  // Special handling for errors
  if (error) {
    console[level === 'debug' ? 'debug' : level]('  Error:');
    console[level === 'debug' ? 'debug' : level](`    Message: ${error.message || error}`);
    if (error.stack) {
      console[level === 'debug' ? 'debug' : level](`    Stack: ${error.stack.split('\n')[0]}`);
    }
  }
  
  // Special handling for structured output (like the one from AI)
  if (structuredOutput) {
    console[level === 'debug' ? 'debug' : level]('  Structured Output:');
    console[level === 'debug' ? 'debug' : level](
      JSON.stringify(structuredOutput, null, 2)
        .split('\n')
        .map(line => `    ${line}`)
        .join('\n')
    );
  }
  
  // Add a line break for better separation between logs
  console[level === 'debug' ? 'debug' : level]('');
}

export const logger = {
  debug: (message: string, context: LogContext = {}) => {
    if (isDevelopment || isTest) {
      if (isServer && isDevelopment) {
        formatForDevelopment('debug', message, context);
      } else {
        console.debug(JSON.stringify({ 
          level: 'debug', 
          message, 
          ...context, 
          timestamp: new Date().toISOString() 
        }));
      }
    }
  },
  
  info: (message: string, context: LogContext = {}) => {
    // In production, limit info logs to important operations
    if (isDevelopment || isTest || context.important) {
      if (isServer && isDevelopment) {
        formatForDevelopment('info', message, context);
      } else {
        console.log(JSON.stringify({ 
          level: 'info', 
          message, 
          ...context, 
          timestamp: new Date().toISOString() 
        }));
      }
    }
  },
  
  warn: (message: string, context: LogContext = {}) => {
    if (isServer && isDevelopment) {
      formatForDevelopment('warn', message, context);
    } else {
      console.warn(JSON.stringify({ 
        level: 'warn', 
        message, 
        ...context, 
        timestamp: new Date().toISOString() 
      }));
    }
  },
  
  error: (message: string, context: LogContext = {}) => {
    if (isServer && isDevelopment) {
      formatForDevelopment('error', message, context);
    } else {
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
  },
  
  /**
   * Creates a formatted log structure for complex data
   * Useful for creating well-structured logs that are both
   * human-readable in development and machine-parseable in production
   */
  formatLogStructure(data: Record<string, any>): Record<string, any> {
    return {
      ...data,
      timestamp: new Date().toISOString()
    };
  }
};

// Log application startup (useful in Vercel logs)
if (isServer) {
  logger.info('Application started', { 
    important: true,
    environment: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION
  });
} 