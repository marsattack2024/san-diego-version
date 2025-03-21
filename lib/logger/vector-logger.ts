import { logger } from './base-logger';
import type { RetrievedDocument } from '../../types/vector/vector';
import type { DocumentSearchMetrics } from '../vector/documentRetrieval';

/**
 * Configuration for sampling rates (adjust as needed for MVP)
 */
const SAMPLING_RATES = {
  // Lower sampling rates reduce logging volume
  debug: 0.1,  // Log 10% of debug events
  info: 0.25,  // Log 25% of info events
  warn: 0.5,   // Log 50% of warning events
  error: 1.0,  // Log 100% of errors
  performance: 0.2  // Log 20% of performance events
};

/**
 * Determine if we should log based on sampling rate
 * @param level - The level of logging to check
 * @returns - True if the log should be emitted, false otherwise
 */
function shouldLog(level: keyof typeof SAMPLING_RATES): boolean {
  // Always log in development environment
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  const rate = SAMPLING_RATES[level] || 1.0;
  return Math.random() <= rate;
}

/**
 * Specialized logger for Supabase Vector operations
 * Provides monitoring for vector embedding creation and searches
 */
export const vectorLogger = {
  // Log embedding creation
  logEmbeddingCreation: (documentId: string, metadata: Record<string, any> = {}) => {
    logger.info('Vector embedding created', {
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
    // Only log if high response time (>500ms) or no results, or by sampling rate
    const isSlowQuery = durationMs > 500;
    const hasNoResults = resultCount === 0;
    
    if (isSlowQuery || hasNoResults || shouldLog('performance')) {
      logger.info(`Vector search query: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`, {
        operation: 'vector_query',
        queryType: params.type || 'similarity',
        resultCount,
        durationMs,
        dimensions: params.dimensions,
        isSlowQuery,
        hasNoResults,
        component: 'vector-search'
      });
    }
  },
  
  // Enhanced vector results logger with document previews and metrics
  logVectorResults: (
    query: string,
    documents: RetrievedDocument[],
    metrics: DocumentSearchMetrics,
    sessionId: string
  ) => {
    // Only log detailed results for slow queries or by sampling 
    if (metrics.isSlowQuery || shouldLog('debug')) {
      // Format document summaries with better organization and line breaks
      const documentSummaries = documents.slice(0, 3).map((doc, index) => {
        // Safely handle ID - ensure it's a string
        const id = doc.id !== undefined ? doc.id : 'unknown';
        
        // Get title from metadata or use ID
        const title = doc.metadata?.title || `Doc ${String(id).substring(0, 8)}`;
        
        // Format the preview with proper line breaks
        const content = typeof doc.content === 'string' ? doc.content : String(doc.content || '');
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        // Replace any existing line breaks with spaces to prevent JSON formatting issues
        const cleanPreview = preview.replace(/\r?\n/g, ' ');
        
        const similarityPercent = Math.round(doc.similarity * 100);
        
        return {
          id,
          title,
          preview: cleanPreview,
          similarity: doc.similarity,
          similarityPercent
        };
      });
      
      // For development, create a nicely formatted message
      const formattedMessage = process.env.NODE_ENV === 'development' 
        ? `Vector search for query (${query.length} chars)`
        : 'Vector search results';
        
      // Create a well-structured log object for both human and machine readability
      const summarizedResults = documentSummaries.map(doc => ({
        id: doc.id,
        title: doc.title,
        similarity: `${doc.similarityPercent}%`
      }));
      
      logger.debug(formattedMessage, {
        sessionId,
        resultCount: documents.length,
        topResults: summarizedResults,
        metrics: {
          retrievalTimeMs: metrics.retrievalTimeMs,
          averageSimilarity: metrics.averageSimilarity,
          fromCache: metrics.fromCache || false
        },
        component: 'vector-search'
      });
    }
  },
  
  // Log vector operations errors
  logVectorError: (operation: string, error: any, context: Record<string, any> = {}) => {
    // Always log errors, but with sampling in production
    if (shouldLog('error')) {
      logger.error(`Vector search error in ${operation}`, {
        ...context,
        error: {
          message: error.message,
          code: error.code,
          status: error.status
        },
        component: 'vector-search'
      });
    }
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
      vectorLogger.logVectorQuery(
        metadata.query || 'unknown',
        metadata.params || {},
        resultCount,
        durationMs
      );
    } else {
      logger.info(`Vector operation completed: ${operationName}`, {
        durationMs,
        ...metadata,
        important: durationMs > 500
      });
    }
    
    return result;
  } catch (error) {
    vectorLogger.logVectorError(operationName, error, {
      requestId,
      durationMs: Math.round(performance.now() - startTime),
      ...metadata
    });
    throw error;
  }
}

// Export only the default
export default vectorLogger; 