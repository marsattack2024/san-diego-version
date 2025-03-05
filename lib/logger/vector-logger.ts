import { logger as baseLogger } from './base-logger';

/**
 * Specialized logger for Supabase Vector operations
 * Provides monitoring for vector embedding creation and searches
 */
export const logger = {
  // Log embedding creation
  logEmbeddingCreation: (documentId: string, metadata: Record<string, any> = {}) => {
    baseLogger.info('Vector embedding created', {
      operation: 'embedding_creation',
      documentId,
      ...metadata,
      important: true
    });
  },
  
  // Log vector searches
  logVectorQuery: (
    query: string, 
    params: Record<string, any> = {}, 
    resultCount: number, 
    durationMs: number
  ) => {
    // Only log if slow or in development
    const isSlowQuery = durationMs > 500;
    
    if (process.env.NODE_ENV === 'development' || isSlowQuery) {
      baseLogger.info(`Vector search completed in ${durationMs}ms`, {
        operation: 'vector_query',
        queryType: params.type || 'similarity',
        resultCount,
        durationMs,
        dimensions: params.dimensions,
        important: isSlowQuery
      });
    }
    
    // Always log slow queries as warnings
    if (isSlowQuery) {
      baseLogger.warn(`Slow vector query (${durationMs}ms)`, {
        operation: 'vector_query',
        queryType: params.type || 'similarity',
        resultCount,
        durationMs
      });
    }
  },
  
  // Log vector operations errors
  logVectorError: (operation: string, error: any, context: Record<string, any> = {}) => {
    baseLogger.error(`Vector operation failed`, {
      operation,
      error,
      ...context,
      important: true
    });
  }
};

/**
 * Example usage for vector operations
 * Useful wrapper function for vector operations
 */
export async function tracedVectorOperation<T>(
  operationName: string,
  fn: () => Promise<T>, 
  metadata: Record<string, any> = {}
): Promise<T> {
  const startTime = performance.now();
  const requestId = metadata.requestId || 'unknown';
  
  try {
    // Execute the vector operation
    const result = await fn();
    
    // Calculate duration
    const durationMs = Math.round(performance.now() - startTime);
    
    // Log success based on operation type
    if (operationName === 'search') {
      const resultCount = Array.isArray(result) ? result.length : 1;
      logger.logVectorQuery(
        metadata.query || 'unknown',
        metadata.params || {},
        resultCount,
        durationMs
      );
    } else {
      baseLogger.info(`Vector operation completed: ${operationName}`, {
        durationMs,
        ...metadata,
        important: durationMs > 500
      });
    }
    
    return result;
  } catch (error) {
    logger.logVectorError(operationName, error, {
      requestId,
      durationMs: Math.round(performance.now() - startTime),
      ...metadata
    });
    throw error;
  }
} 