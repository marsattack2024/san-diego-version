import { logger } from '../logger';
import { redisCache } from './rag-cache';
import { THRESHOLDS } from '../logger/edge-logger';
import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES, OPERATION_TYPES } from '../logger/constants';
import type { RetrievedDocument } from './types';
import { supabase } from '../db';
import { createEmbedding } from './embeddings';

// Cache statistics for monitoring
const cacheStats = {
  hits: 0,
  misses: 0,
  semanticHits: 0
};

// Log cache statistics periodically
setInterval(() => {
  logger.info('Vector cache statistics', {
    ...cacheStats
  });
}, 5 * 60 * 1000); // Log every 5 minutes

interface SupabaseDocument {
  id: string;
  content: string;
  similarity: number;
  metadata?: string;
}

async function findSimilarDocuments(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<RetrievedDocument[]> {
  const userQueryEmbedded = await createEmbedding(queryText);

  const { data: similarDocs, error } = await supabase
    .rpc('match_documents', {
      query_embedding: userQueryEmbedded,
      match_count: options.limit || 5,
      filter: options.metadataFilter || {}
    });

  if (error) {
    throw error;
  }

  return (similarDocs as SupabaseDocument[]).map(doc => ({
    id: doc.id,
    content: doc.content,
    similarity: doc.similarity,
    metadata: typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {})
  }));
}

/**
 * Performance monitoring wrapper for findSimilarDocuments
 * This function tracks performance metrics and logs slow queries
 */
export async function findSimilarDocumentsWithPerformance(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  const startTime = performance.now();
  const sessionId = options.sessionId || Math.random().toString(36).substring(2, 15);

  try {
    const documents = await findSimilarDocuments(queryText, options);

    const endTime = performance.now();
    const retrievalTimeMs = Math.round(endTime - startTime);
    const count = documents.length;

    // Calculate similarity metrics
    let averageSimilarity = 0;
    let highestSimilarity = 0;
    let lowestSimilarity = 1;

    if (count > 0) {
      const similarities = documents.map(doc => doc.score ?? 0);
      averageSimilarity = similarities.reduce((sum, val) => sum + val, 0) / count;
      highestSimilarity = Math.max(...similarities);
      lowestSimilarity = Math.min(...similarities);
    }

    const isSlowQuery = retrievalTimeMs > 500; // Consider queries taking more than 500ms as slow
    logQueryPerformance(queryText, retrievalTimeMs, count, sessionId);

    return {
      documents,
      metrics: {
        count,
        averageSimilarity,
        highestSimilarity,
        lowestSimilarity,
        retrievalTimeMs,
        isSlowQuery,
      }
    };
  } catch (error) {
    const endTime = performance.now();
    const retrievalTimeMs = Math.round(endTime - startTime);

    logger.error('Vector search failed', {
      error,
      queryLength: queryText.length,
      retrievalTimeMs,
      sessionId,
    });

    throw error;
  }
}

function logQueryPerformance(queryText: string, retrievalTimeMs: number, count: number, sessionId: string) {
  logger.info('Vector query performance', {
    queryLength: queryText.length,
    retrievalTimeMs,
    documentCount: count,
    sessionId,
    slow: retrievalTimeMs > 500
  });
}

function calculateAverageSimilarity(documents: RetrievedDocument[]): number {
  if (!documents.length) return 0;
  const validScores = documents.filter(doc => typeof doc.score === 'number').map(doc => doc.score as number);
  if (!validScores.length) return 0;
  return validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
}

function calculateSearchMetrics(documents: RetrievedDocument[]): DocumentSearchMetrics {
  const startTime = Date.now();
  const validScores = documents
    .filter(doc => typeof doc.score === 'number')
    .map(doc => doc.score as number);

  return {
    count: documents.length,
    averageSimilarity: calculateAverageSimilarity(documents),
    highestSimilarity: validScores.length ? Math.max(...validScores) : 0,
    lowestSimilarity: validScores.length ? Math.min(...validScores) : 0,
    retrievalTimeMs: Date.now() - startTime,
    isSlowQuery: (Date.now() - startTime) > 1000
  };
}

// Replace the generateConsistentCacheKey function with Web Crypto API version
async function generateConsistentCacheKey(queryText: string, options: DocumentSearchOptions = {}): Promise<string> {
  // Create a stable representation of the query and relevant options
  const keyContent = {
    query: queryText.toLowerCase().trim(),
    filter: options.metadataFilter || {},
    limit: options.limit || 10
  };

  // Use Web Crypto API for hashing to ensure consistency
  const msgUint8 = new TextEncoder().encode(JSON.stringify(keyContent));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Return just the first 16 characters of the hash for a shorter key
  return hashHex.slice(0, 16);
}

// Update findSimilarDocumentsOptimized to be async
export async function findSimilarDocumentsOptimized(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  const ragOperationId = `rag-${Date.now().toString(36)}`;
  const startTime = performance.now();

  // Use consistent cache key with await
  const cacheKey = await generateConsistentCacheKey(queryText, options);

  // Log the start of the RAG operation with cache check
  edgeLogger.info('Starting RAG operation with cache check', {
    operation: OPERATION_TYPES.RAG_SEARCH,
    ragOperationId,
    queryLength: queryText.length,
    queryPreview: queryText.substring(0, 20) + '...',
    cacheKey: `global:rag:${cacheKey}`
  });

  try {
    const cachedResults = await redisCache.getRAG('global', cacheKey);

    // Log cache check attempt
    edgeLogger.debug('RAG cache check completed', {
      operation: 'rag_cache_check',
      ragOperationId,
      cacheHit: !!cachedResults,
      valueType: cachedResults ? typeof cachedResults : 'null'
    });

    if (cachedResults) {
      try {
        // Since our get method now handles JSON parsing, this should either be 
        // an already parsed object or a string
        const parsedResults = typeof cachedResults === 'string'
          ? JSON.parse(cachedResults)
          : cachedResults;

        // Validate the structure matches our interface
        if (parsedResults &&
          typeof parsedResults === 'object' &&
          Array.isArray(parsedResults.documents) &&
          parsedResults.documents.every((doc: any) =>
            doc.id &&
            doc.content &&
            (typeof doc.score === 'number' || typeof doc.similarity === 'number')
          ) &&
          parsedResults.metrics &&
          parsedResults.timestamp
        ) {
          const durationMs = Math.round(performance.now() - startTime);

          // Log cache hit with comprehensive details
          edgeLogger.info('RAG cache hit', {
            operation: 'rag_cache_hit',
            ragOperationId,
            durationMs,
            resultsCount: parsedResults.documents.length,
            cacheAge: Date.now() - parsedResults.timestamp,
            fromCache: true,
            status: 'completed_from_cache',
            cacheSource: 'redis'
          });

          // Also log to the vector logger for backwards compatibility
          logger.info('RAG operation completed from cache', {
            category: 'tools',
            operation: 'rag_search',
            ragOperationId,
            durationMs,
            resultsCount: parsedResults.documents.length,
            status: 'completed_from_cache',
            fromCache: true
          });

          return {
            documents: parsedResults.documents,
            metrics: {
              ...parsedResults.metrics,
              retrievalTimeMs: durationMs,
              fromCache: true
            }
          };
        } else {
          // Log invalid cache structure
          edgeLogger.warn('Invalid RAG cache structure', {
            operation: 'rag_cache_invalid',
            ragOperationId,
            fields: parsedResults ? Object.keys(parsedResults) : 'none'
          });
        }
      } catch (parseError) {
        // Log parsing error
        edgeLogger.error('Error parsing RAG cached content', {
          operation: 'rag_cache_parse_error',
          ragOperationId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          cachedContentSample: typeof cachedResults === 'string'
            ? cachedResults.substring(0, 100) + '...'
            : `type: ${typeof cachedResults}`
        });
      }
    } else {
      // Log cache miss at WARNING level - 100% sampling per logging rules
      edgeLogger.warn('RAG cache miss', {
        operation: 'rag_cache_miss',
        ragOperationId,
        queryLength: queryText.length,
        queryPreview: queryText.substring(0, 20) + '...'
      });
    }
  } catch (error) {
    // Log cache retrieval error
    edgeLogger.error('Error checking RAG Redis cache', {
      operation: 'rag_cache_error',
      ragOperationId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
  }

  // Cache miss or error - perform vector search
  edgeLogger.info('Performing vector search after cache miss', {
    operation: 'vector_search_start',
    ragOperationId,
    queryLength: queryText.length
  });

  const documents = await findSimilarDocuments(queryText, options);
  const durationMs = Math.round(performance.now() - startTime);
  const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
  const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;

  // Calculate metrics
  const metrics = {
    ...calculateSearchMetrics(documents),
    retrievalTimeMs: durationMs,
    fromCache: false
  };

  // Cache results
  try {
    const cacheableResults = {
      documents,
      metrics,
      timestamp: Date.now()
    };

    // Serialize to JSON string before caching
    const serializedResults = JSON.stringify(cacheableResults);
    await redisCache.setRAG('global', cacheKey, serializedResults);

    // Log cache storage operation
    edgeLogger.info('Stored RAG results in Redis cache', {
      operation: 'rag_cache_set',
      ragOperationId,
      contentLength: serializedResults.length,
      documentCount: documents.length,
      ttl: 12 * 60 * 60, // 12 hours
      cacheKey: `global:rag:${cacheKey}`
    });

    // Single consolidated log for cache miss
    edgeLogger.info('RAG operation completed with fresh search', {
      operation: OPERATION_TYPES.RAG_SEARCH,
      ragOperationId,
      durationMs,
      resultsCount: documents.length,
      slow: isSlow,
      important: isImportant,
      status: documents.length > 0 ? 'completed' : 'no_matches',
      fromCache: false
    });

    // Also log to the vector logger for backwards compatibility
    logger.info('RAG operation completed', {
      category: 'tools',
      operation: 'rag_search',
      ragOperationId,
      durationMs,
      resultsCount: documents.length,
      slow: isSlow,
      important: isImportant,
      status: documents.length > 0 ? 'completed' : 'no_matches',
      fromCache: false,
      level: isSlow ? 'warn' : 'info'
    });

  } catch (error) {
    // Log cache storage error
    edgeLogger.error('RAG cache set failed', {
      operation: 'rag_cache_set_error',
      ragOperationId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
  }

  return { documents, metrics };
}

export async function retrieveDocuments(
  query: string,
  options: {
    limit?: number;
    threshold?: number;
    metadata?: Record<string, any>;
  } = {}
): Promise<RetrievedDocument[]> {
  const searchOptions: DocumentSearchOptions = {
    limit: options.limit,
    similarityThreshold: options.threshold,
    metadataFilter: options.metadata
  };

  const { documents } = await findSimilarDocumentsOptimized(query, searchOptions);
  return documents;
}

interface DocumentSearchOptions {
  limit?: number;
  similarityThreshold?: number;
  metadataFilter?: Record<string, any>;
  sessionId?: string;
  skipCache?: boolean; // Added option to bypass cache when needed
}

export interface DocumentSearchMetrics {
  count: number;
  averageSimilarity: number;
  highestSimilarity: number;
  lowestSimilarity: number;
  retrievalTimeMs: number;
  isSlowQuery: boolean;
  usedFallbackThreshold?: boolean;
  fromCache?: boolean;
  semanticMatch?: boolean;
  error?: string;
} 