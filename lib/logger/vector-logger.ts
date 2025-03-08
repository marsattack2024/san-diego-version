import { logger as baseLogger } from './base-logger';
import type { RetrievedDocument } from '../../types/vector/vector';
import type { DocumentSearchMetrics } from '../vector/documentRetrieval';

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
  
  // Enhanced vector results logger with document previews and metrics
  logVectorResults: (
    query: string,
    documents: RetrievedDocument[],
    metrics: DocumentSearchMetrics,
    sessionId: string
  ) => {
    // Format document summaries with better organization and line breaks
    const documentSummaries = documents.map((doc, index) => {
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
    const structuredOutput = {
      search: {
        query: {
          text: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
          length: query.length
        },
        metrics: {
          resultCount: documents.length,
          avgSimilarity: `${Math.round(metrics.averageSimilarity * 100)}%`,
          highSimilarity: `${Math.round(metrics.highestSimilarity * 100)}%`,
          lowSimilarity: `${Math.round(metrics.lowestSimilarity * 100)}%`,
          durationMs: metrics.retrievalTimeMs
        },
        results: documentSummaries.map(doc => ({
          id: doc.id,
          title: doc.title,
          similarity: `${doc.similarityPercent}%`
        }))
      }
    };

    // Log the results with better formatting
    baseLogger.info(formattedMessage, {
      operation: 'vector_results',
      queryLength: query.length,
      resultCount: documents.length,
      averageSimilarity: Math.round(metrics.averageSimilarity * 100) / 100,
      highestSimilarity: Math.round(metrics.highestSimilarity * 100) / 100,
      lowestSimilarity: Math.round(metrics.lowestSimilarity * 100) / 100,
      durationMs: metrics.retrievalTimeMs,
      sessionId,
      documents: documentSummaries,
      structuredOutput, // Include the nicely structured output
      important: true
    });
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