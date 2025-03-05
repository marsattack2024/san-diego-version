import { logger } from '../logger/vector-logger';
import type { RetrievedDocument } from '../../types/vector/vector.js';
import { supabase } from '../db';
import { createEmbedding } from './embeddings';

interface DocumentSearchOptions {
  limit?: number;
  similarityThreshold?: number;
  metadataFilter?: Record<string, any>;
  sessionId?: string;
}

interface DocumentSearchMetrics {
  count: number;
  averageSimilarity: number;
  highestSimilarity: number;
  lowestSimilarity: number;
  retrievalTimeMs: number;
  isSlowQuery: boolean;
  usedFallbackThreshold?: boolean;
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
      filter: options.metadataFilter || {},
      match_count: options.limit || 4
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
      const similarities = documents.map(doc => doc.similarity);
      averageSimilarity = similarities.reduce((sum, val) => sum + val, 0) / count;
      highestSimilarity = Math.max(...similarities);
      lowestSimilarity = Math.min(...similarities);
    }
    
    const isSlowQuery = retrievalTimeMs > 500; // Consider queries taking more than 500ms as slow
    logQueryPerformance(queryText, retrievalTimeMs, count, sessionId, isSlowQuery);
    
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
    
    logger.logVectorError('vector-search', error, {
      queryLength: queryText.length,
      retrievalTimeMs,
      sessionId,
    });
    
    throw error;
  }
}

function logQueryPerformance(queryText: string, retrievalTimeMs: number, count: number, sessionId: string, isSlowQuery: boolean) {
  logger.logVectorQuery(queryText, {
    retrievalTimeMs,
    documentCount: count,
    sessionId,
  }, count, retrievalTimeMs);
}

/**
 * Optimized version of findSimilarDocuments that implements:
 * 1. Query preprocessing to improve match quality
 * 2. Performance monitoring
 * 3. Automatic retry with adjusted parameters for failed searches
 */
export async function findSimilarDocumentsOptimized(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  const sessionId = options.sessionId || Math.random().toString(36).substring(2, 15);
  const startTime = performance.now();
  
  const processedQuery = preprocessQuery(queryText);
  
  try {
    const result = await findSimilarDocumentsWithPerformance(processedQuery, {
      ...options,
      sessionId,
    });
    
    const endTime = performance.now();
    const retrievalTimeMs = Math.round(endTime - startTime);
    
    if (result.documents.length === 0 && (options.similarityThreshold || 0.5) > 0.3) {
      logger.logVectorQuery(queryText, {
        originalThreshold: options.similarityThreshold || 0.5,
        newThreshold: 0.3,
        sessionId,
        retrievalTimeMs,
      }, 0, retrievalTimeMs);
      
      const fallbackResult = await findSimilarDocumentsWithPerformance(processedQuery, {
        ...options,
        similarityThreshold: 0.3,
        sessionId,
      });
      
      fallbackResult.metrics.usedFallbackThreshold = true;
      
      return fallbackResult;
    }
    
    return result;
  } catch (error) {
    const endTime = performance.now();
    const retrievalTimeMs = Math.round(endTime - startTime);
    
    logger.logVectorError('optimized-vector-search', error, {
      queryLength: queryText.length,
      retrievalTimeMs,
      sessionId,
    });
    
    throw error;
  }
}

/**
 * Preprocess a query to improve match quality
 * - Removes filler words
 * - Normalizes whitespace
 * - Extracts key terms
 */
function preprocessQuery(query: string): string {
  let processed = query.toLowerCase();
  
  const fillerWords = [
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will',
    'would', 'should', 'may', 'might', 'must', 'about', 'for', 'with',
    'in', 'on', 'at', 'by', 'to', 'from', 'of', 'as', 'i', 'you', 'he',
    'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
  ];
  
  if (processed.split(' ').length > 5) {
    const words = processed.split(' ');
    const filteredWords = words.filter(word => !fillerWords.includes(word));
    
    if (filteredWords.length >= words.length * 0.6) {
      processed = filteredWords.join(' ');
    }
  }
  
  processed = processed.replace(/\s+/g, ' ').trim();
  
  return processed;
} 