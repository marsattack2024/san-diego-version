import { logger } from '@/lib/logger/base-logger';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

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
    trace: 'debug',  // We map trace to debug since base logger doesn't have trace
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    TRACE: 'debug',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
  };
  
  return levelMap[clientLevel] || 'info';
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || uuidv4();
  
  try {
    logger.debug('Received client logs', {
      requestId,
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    
    // Handle both single log and batch logs
    const body = await req.json();
    const logs = Array.isArray(body) ? body : [body];
    
    logger.debug('Processing client logs', { 
      requestId,
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
      
      // Create context with client metadata
      const context = {
        requestId,
        clientSessionId: sessionId,
        clientNamespace: namespace,
        clientTimestamp: timestamp,
        ...data
      };
      
      // Use the appropriate log level method
      switch (level) {
        case 'debug':
          logger.debug(message || 'Client debug log', context);
          break;
        case 'info':
          logger.info(message || 'Client info log', context);
          break;
        case 'warn':
          logger.warn(message || 'Client warning log', context);
          break;
        case 'error':
          logger.error(message || 'Client error log', context);
          break;
        default:
          logger.info(message || 'Client log', context);
      }
    }
    
    logger.debug('Processed client logs', { 
      requestId,
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
    
    logger.error('Error processing client logs', {
      requestId,
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