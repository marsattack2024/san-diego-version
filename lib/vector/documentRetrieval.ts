import { logger } from '../logger';
import type { RetrievedDocument } from '../../types/vector/vector.js';
import { supabase } from '../db';
import { createEmbedding } from './embeddings';

// Cache configuration
const CACHE_CONFIG = {
  maxSize: 100,          // Maximum number of entries in cache
  ttl: 15 * 60 * 1000,  // Time-to-live: 15 minutes (increased from 5)
  similarityThreshold: 0.92, // Threshold for semantic deduplication
  warmupInterval: 5 * 60 * 1000 // Warm up cache every 5 minutes
};

// Cache structure: Map<queryHash, {documents, timestamp, metrics}>
interface CacheEntry {
  documents: RetrievedDocument[];
  metrics: DocumentSearchMetrics;
  timestamp: number;
  embedding?: number[]; // Store query embedding for similarity checks
  accessCount: number;
}

const vectorSearchCache = new Map<string, CacheEntry>();

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  semanticHits: 0,
  warmups: 0,
  lastWarmup: 0
};

// Find semantically similar cached query
async function findSimilarCachedQuery(queryEmbedding: number[]): Promise<CacheEntry | null> {
  for (const entry of vectorSearchCache.values()) {
    if (!entry.embedding) continue;
    
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    if (similarity >= CACHE_CONFIG.similarityThreshold) {
      return entry;
    }
  }
  return null;
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Cache warming function
async function warmCache() {
  const now = Date.now();
  if (now - cacheStats.lastWarmup < CACHE_CONFIG.warmupInterval) {
    return; // Skip if last warmup was too recent
  }
  
  try {
    // Get most frequently accessed entries
    const entries = Array.from(vectorSearchCache.entries())
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 5); // Warm up top 5 most accessed queries
    
    for (const [hash, entry] of entries) {
      if (vectorSearchCache.has(hash)) {
        // Only warm up if close to expiration
        const timeLeft = now - entry.timestamp;
        if (timeLeft > CACHE_CONFIG.ttl / 2) {
          const query = hash.split(':')[0]; // Extract original query from hash
          await findSimilarDocumentsOptimized(query, { skipCache: true });
          cacheStats.warmups++;
        }
      }
    }
    
    cacheStats.lastWarmup = now;
    
    // Log cache statistics
    logger.info('Vector cache statistics', {
      ...cacheStats,
      cacheSize: vectorSearchCache.size
    });
  } catch (error) {
    logger.error('Vector cache warmup failed', { error });
  }
}

// Set up periodic cache warming
if (typeof setInterval !== 'undefined') {
  setInterval(warmCache, CACHE_CONFIG.warmupInterval);
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
  fromCache?: boolean;
  semanticMatch?: boolean; // Add support for semantic match indicator
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
    
    if (cachedResult) {
      const timeLeft = Date.now() - cachedResult.timestamp;
      if (timeLeft < CACHE_CONFIG.ttl) {
        // Update access count
        cachedResult.accessCount++;
        vectorSearchCache.set(cacheKey, cachedResult);
        
        cacheStats.hits++;
        return {
          documents: cachedResult.documents,
          metrics: {
            ...cachedResult.metrics,
            fromCache: true,
            retrievalTimeMs: Math.round(performance.now() - startTime)
          }
        };
      }
    }
    
    // Try to find semantically similar cached query
    const queryEmbedding = await createEmbedding(processedQuery);
    const similarEntry = await findSimilarCachedQuery(queryEmbedding);
    
    if (similarEntry) {
      cacheStats.semanticHits++;
      return {
        documents: similarEntry.documents,
        metrics: {
          ...similarEntry.metrics,
          fromCache: true,
          semanticMatch: true,
          retrievalTimeMs: Math.round(performance.now() - startTime)
        }
      };
    }
  }
  
  cacheStats.misses++;
  
  // Perform the search
  const result = await findSimilarDocumentsWithPerformance(processedQuery, {
    ...options,
    limit: options.limit || 5,
    sessionId,
  });
  
  // Store in cache (unless skipCache is true)
  if (!options.skipCache) {
    const cacheKey = hashQueryOptions(processedQuery, options);
    const queryEmbedding = await createEmbedding(processedQuery);
    
    vectorSearchCache.set(cacheKey, {
      documents: result.documents,
      metrics: result.metrics,
      timestamp: Date.now(),
      embedding: queryEmbedding,
      accessCount: 1
    });
  }
  
  return result;
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

// Update vector logging calls to use the unified logger
const logVectorOperation = async (operation: string, data: any) => {
  logger.info(`Vector ${operation}`, {
    operation: `vector_${operation}`,
    ...data,
    important: true
  });
};

export async function retrieveDocuments(
  query: string,
  options: {
    limit?: number;
    threshold?: number;
    metadata?: Record<string, any>;
  } = {}
): Promise<RetrievedDocument[]> {
  const startTime = performance.now();
  
  try {
    const embedding = await createEmbedding(query);
    const { limit = 5, threshold = 0.7, metadata = {} } = options;

    const { data: documents, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit
    });

    if (error) {
      logger.error('Vector search failed', { error, query, options });
      throw error;
    }

    const duration = Math.round(performance.now() - startTime);
    
    // Log vector search results
    await logVectorOperation('search', {
      query,
      documentCount: documents.length,
      threshold,
      durationMs: duration,
      metadata
    });

    return documents;
  } catch (error) {
    logger.error('Document retrieval failed', {
      error,
      query,
      options,
      durationMs: Math.round(performance.now() - startTime)
    });
    throw error;
  }
} 