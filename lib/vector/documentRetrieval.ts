import vectorLogger from '../logger/vector-logger';
import type { RetrievedDocument } from '../../types/vector/vector.js';
import { supabase } from '../db';
import { createEmbedding } from './embeddings';

// Simple in-memory cache for vector search results
// Cache structure: Map<queryHash, {documents, timestamp, metrics}>
interface CacheEntry {
  documents: RetrievedDocument[];
  metrics: DocumentSearchMetrics;
  timestamp: number;
}

// Cache configuration
const CACHE_SIZE_LIMIT = 100; // Maximum number of entries in cache
const CACHE_TTL = 5 * 60 * 1000; // Time-to-live: 5 minutes (in milliseconds)
const vectorSearchCache = new Map<string, CacheEntry>();

// Simple cache cleanup function
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    let expiredCount = 0;
    
    // Remove expired entries
    for (const [key, entry] of vectorSearchCache.entries()) {
      if (now - entry.timestamp > CACHE_TTL) {
        vectorSearchCache.delete(key);
        expiredCount++;
      }
    }
    
    // If we're over the size limit, remove oldest entries
    if (vectorSearchCache.size > CACHE_SIZE_LIMIT) {
      const entries = Array.from(vectorSearchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, entries.length - CACHE_SIZE_LIMIT);
      toRemove.forEach(([key]) => {
        vectorSearchCache.delete(key);
        expiredCount++;
      });
    }
    
    if (expiredCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[Vector Cache] Cleaned up ${expiredCount} entries, current size: ${vectorSearchCache.size}`);
    }
  }, 60 * 1000); // Run every minute
}

// Simple hash function for query + options
function hashQueryOptions(query: string, options: DocumentSearchOptions): string {
  const { limit = 5, similarityThreshold, metadataFilter, sessionId } = options;
  const filterStr = metadataFilter ? JSON.stringify(metadataFilter) : '';
  return `${query}:${limit}:${similarityThreshold}:${filterStr}:${sessionId || ''}`;
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
  fromCache?: boolean; // New field to track cache hits
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
    
    vectorLogger.logVectorError('vector-search', error, {
      queryLength: queryText.length,
      retrievalTimeMs,
      sessionId,
    });
    
    throw error;
  }
}

function logQueryPerformance(queryText: string, retrievalTimeMs: number, count: number, sessionId: string, isSlowQuery: boolean) {
  vectorLogger.logVectorQuery(queryText, {
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
 * 4. In-memory caching for recent queries
 */

export async function findSimilarDocumentsOptimized(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  const sessionId = options.sessionId || Math.random().toString(36).substring(2, 15);
  const startTime = performance.now();
  
  const processedQuery = preprocessQuery(queryText);
  
  // Check cache first (unless skipCache is true)
  if (!options.skipCache) {
    const cacheKey = hashQueryOptions(processedQuery, options);
    const cachedResult = vectorSearchCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_TTL) {
      // Add cache hit information to metrics
      const cachedMetrics = {
        ...cachedResult.metrics,
        fromCache: true,
        retrievalTimeMs: Math.round(performance.now() - startTime) // Measure cache retrieval time
      };
      
      // Log cache hit
      vectorLogger.logVectorQuery(queryText, {
        fromCache: true,
        originalRetrievalTimeMs: cachedResult.metrics.retrievalTimeMs,
        cacheRetrievalTimeMs: cachedMetrics.retrievalTimeMs,
        sessionId,
      }, cachedResult.documents.length, cachedMetrics.retrievalTimeMs);
      
      return {
        documents: cachedResult.documents,
        metrics: cachedMetrics
      };
    }
  }
  
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
      vectorLogger.logVectorQuery(queryText, {
        originalThreshold: 0.6,
        newThreshold: 0.4,
        sessionId,
        retrievalTimeMs,
      }, result.documents.length, retrievalTimeMs);
      
      result.metrics.usedFallbackThreshold = true;
    }
    
    // Store in cache (unless skipCache is true)
    if (!options.skipCache) {
      const cacheKey = hashQueryOptions(processedQuery, options);
      vectorSearchCache.set(cacheKey, {
        documents: result.documents,
        metrics: result.metrics,
        timestamp: Date.now()
      });
    }
    
    // Log detailed results with the new logger function
    vectorLogger.logVectorResults(
      queryText,
      result.documents,
      result.metrics,
      sessionId
    );
    
    return result;
  } catch (error) {
    const endTime = performance.now();
    const retrievalTimeMs = Math.round(endTime - startTime);
    
    vectorLogger.logVectorError('optimized-vector-search', error, {
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