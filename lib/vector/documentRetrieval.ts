import { logger } from '../logger';
import type { RetrievedDocument } from './types';
import { supabase } from '../db';
import { createEmbedding } from './embeddings';
import { redisCache } from './rag-cache';

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
  // Use consistent cache key with await
  const cacheKey = await generateConsistentCacheKey(queryText, options);

  try {
    const cachedResults = await redisCache.getRAG('global', cacheKey);
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
          parsedResults.timestamp &&
          typeof parsedResults.timestamp === 'number'
        ) {
          logger.debug('Using cached RAG results', {
            category: 'tools',
            operation: 'rag_search',
            durationMs: parsedResults.metrics.retrievalTimeMs,
            cacheAge: Date.now() - parsedResults.timestamp
          });

          return {
            documents: parsedResults.documents,
            metrics: parsedResults.metrics
          };
        } else {
          logger.debug('Cache structure invalid for RAG results', {
            category: 'tools',
            operation: 'rag_search',
            reason: 'invalid_cache_structure'
          });
        }
      } catch (error) {
        logger.debug('Error parsing cached RAG results', {
          category: 'tools',
          operation: 'rag_search',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    logger.debug('Error retrieving from RAG cache', {
      category: 'tools',
      operation: 'rag_search',
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Perform vector search
  const documents = await findSimilarDocuments(queryText, options);

  // Calculate metrics
  const metrics = calculateSearchMetrics(documents);

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
  } catch (error) {
    logger.error('RAG operation failed', {
      category: 'tools',
      operation: 'cache_set',
      error: error instanceof Error ? error.message : String(error),
      important: true,
      level: 'error'
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