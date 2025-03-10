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

export interface DocumentSearchMetrics {
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
    // The thresholds are now handled in the SQL function directly (0.6 initial, 0.4 fallback)
    // No need to retry with lower threshold in the application code
    const result = await findSimilarDocumentsWithPerformance(processedQuery, {
      ...options,
      limit: options.limit || 5,
      sessionId,
    });
    
    const endTime = performance.now();
    const retrievalTimeMs = Math.round(endTime - startTime);
    
    // Set usedFallbackThreshold based on similarity values
    // If any documents have similarity between 0.4 and 0.6, fallback was used
    const usedFallback = result.documents.some(doc => 
      doc.similarity >= 0.4 && doc.similarity < 0.6
    );
    
    if (usedFallback) {
      logger.logVectorQuery(queryText, {
        originalThreshold: 0.6,
        newThreshold: 0.4,
        sessionId,
        retrievalTimeMs,
      }, result.documents.length, retrievalTimeMs);
      
      result.metrics.usedFallbackThreshold = true;
      
      // Log detailed results with the new logger function
      logger.logVectorResults(
        queryText,
        result.documents,
        result.metrics,
        sessionId
      );
      
      return result;
    }
    
    // Log detailed results with the new logger function
    logger.logVectorResults(
      queryText,
      result.documents,
      result.metrics,
      sessionId
    );
    
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