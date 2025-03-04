import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '../../../utils/server-logger';

// Map client log levels to server log levels
const logLevelMap: Record<string, keyof typeof logMethods> = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal'
};

// Define the logger method types
const logMethods = {
  trace: true,
  debug: true,
  info: true,
  warn: true,
  error: true,
  fatal: true
};

// Create a logger instance
const logger = createLogger('api:client-logs');

/**
 * API route to handle client-side logs
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP and user agent for context
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Parse the logs from the request
    const logs = await request.json();
    
    // Create a child logger with client context
    const clientLogger = logger.child({
      source: 'client',
      ip,
      userAgent: userAgent.substring(0, 100) // Truncate long user agents
    });
    
    // Process each log entry
    if (Array.isArray(logs)) {
      logs.forEach((log) => {
        try {
          // Parse the log message if it's a string (it might be JSON)
          const logData = typeof log.message === 'string' && log.message.startsWith('{') 
            ? JSON.parse(log.message) 
            : { message: log.message };
          
          // Map client level to server level
          const level = logLevelMap[log.level] || 'info';
          
          // Log with the appropriate level
          if (level in clientLogger) {
            // Type assertion to handle dynamic method access
            (clientLogger as any)[level](logData, logData.message || 'Client log');
          } else {
            clientLogger.info(logData, logData.message || 'Client log');
          }
        } catch (err) {
          // If parsing fails, log the raw message
          clientLogger.info({ rawLog: log }, 'Unparseable client log');
        }
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error processing client logs');
    return NextResponse.json(
      { success: false, error: 'Failed to process logs' },
      { status: 500 }
    );
  }
} 