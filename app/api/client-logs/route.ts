import { createLogger, createRequestLogger, Logger } from '@/utils/server-logger';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Create a logger for this API route
const log = createLogger('api:client-logs');

export const dynamic = 'force-dynamic';

// Sampling rates for different log levels
const samplingRates = {
  trace: 0.01,  // 1% of trace logs
  debug: 0.05,  // 5% of debug logs
  info: 0.2,    // 20% of info logs
  warn: 1.0,    // 100% of warnings
  error: 1.0    // 100% of errors
};

/**
 * Determine if a log should be processed based on sampling
 */
function shouldProcessLog(level: string): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true; // Always process in non-production
  }
  
  const rate = samplingRates[level as keyof typeof samplingRates] || 1.0;
  return Math.random() < rate;
}

/**
 * Map client log level to server log level
 */
function mapLogLevel(clientLevel: string): string {
  const levelMap: Record<string, string> = {
    trace: 'trace',
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    TRACE: 'trace',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
  };
  
  return levelMap[clientLevel] || 'info';
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || 'unknown';
  const requestLogger = log.child({ requestId });
  
  try {
    requestLogger.debug('Received client logs', {
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    
    // Handle both single log and batch logs
    const body = await req.json();
    const logs = Array.isArray(body) ? body : [body];
    
    requestLogger.debug('Processing client logs', { 
      count: logs.length,
      timestamp: new Date().toISOString()
    });
    
    // Process each log based on sampling
    let processedCount = 0;
    
    for (const clientLog of logs) {
      const level = mapLogLevel(clientLog.level);
      
      // Apply sampling
      if (!shouldProcessLog(level)) {
        continue;
      }
      
      processedCount++;
      
      // Extract standard fields
      const { message, namespace, sessionId, timestamp, ...data } = clientLog;
      
      // Log to server with appropriate level and context
      const contextLogger = log.child({ 
        clientSessionId: sessionId,
        clientNamespace: namespace,
        clientTimestamp: timestamp,
        requestId
      });
      
      // Use the appropriate log level method
      switch (level) {
        case 'trace':
          contextLogger.trace(message || 'Client trace log', data);
          break;
        case 'debug':
          contextLogger.debug(message || 'Client debug log', data);
          break;
        case 'info':
          contextLogger.info(message || 'Client info log', data);
          break;
        case 'warn':
          contextLogger.warn(message || 'Client warning log', data);
          break;
        case 'error':
          contextLogger.error(message || 'Client error log', data);
          break;
        default:
          contextLogger.info(message || 'Client log', data);
      }
    }
    
    requestLogger.debug('Processed client logs', { 
      totalReceived: logs.length,
      processedCount,
      samplingApplied: process.env.NODE_ENV === 'production',
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({ 
      success: true, 
      message: `Processed ${processedCount} of ${logs.length} logs` 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    requestLogger.error('Error processing client logs', {
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { success: false, error: 'Failed to process client logs' },
      { status: 500 }
    );
  }
} 