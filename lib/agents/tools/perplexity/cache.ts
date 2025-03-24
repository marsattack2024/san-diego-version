import { createHash } from 'node:crypto';
import { clientLogger } from '../../../logger/client-logger.js';
import { redisCache } from '../../../cache/redis-client';
import { createEmbedding } from '../../../vector/embeddings';

// Create a component-specific logger wrapper
const logger = {
  debug: (message: string, context = {}) => clientLogger.debug(`[agent:tools:perplexity:cache] ${message}`, context),
  info: (message: string, context = {}) => clientLogger.info(`[agent:tools:perplexity:cache] ${message}`, context),
  warn: (message: string, context = {}) => clientLogger.warn(`[agent:tools:perplexity:cache] ${message}`, context),
  error: (message: string | Error, context = {}) => clientLogger.error(`[agent:tools:perplexity:cache] ${message}`, context)
};

interface CacheEntry {
  response_text: string;
  query_embedding?: number[];
  created_at: string;
}

/**
 * Create a hash of the query for efficient caching
 */
export function hashQuery(query: string): string {
  return createHash('md5')
    .update(query.trim().toLowerCase())
    .digest('hex');
}

/**
 * Find semantically similar cached query
 */
async function findSimilarCachedQuery(queryEmbedding: number[], queryHash: string): Promise<string | null> {
  try {
    // Get all cache keys from Redis
    const keys = await redisCache.keys('perplexity:*');
    
    for (const key of keys) {
      if (key === `perplexity:${queryHash}`) continue; // Skip exact match
      
      const entry = await redisCache.get(key) as CacheEntry | null;
      if (!entry?.query_embedding) continue;
      
      const similarity = cosineSimilarity(queryEmbedding, entry.query_embedding);
      if (similarity >= 0.92) { // High similarity threshold
        return entry.response_text;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('Error finding similar cached query', { error });
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
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

/**
 * Check if a query result exists in cache
 */
export async function checkCache(query: string) {
  const queryHash = hashQuery(query);
  const normalizedQuery = query.trim().toLowerCase();
  
  logger.debug('Checking perplexity cache', { queryHash });
  
  try {
    // Check exact match first
    const cacheKey = `perplexity:${queryHash}`;
    const cacheEntry = await redisCache.get(cacheKey) as CacheEntry | null;
    
    if (cacheEntry) {
      const createdAt = new Date(cacheEntry.created_at).getTime();
      const now = Date.now();
      
      if (now - createdAt < 12 * 60 * 60 * 1000) { // 12 hours TTL
        logger.info('Cache hit for perplexity query', { queryHash });
        redisCache.recordStats('hit');
        return cacheEntry.response_text;
      }
      
      logger.info('Cache expired for perplexity query', { queryHash });
    }
    
    // Try semantic similarity match
    const queryEmbedding = await createEmbedding(normalizedQuery);
    const similarResponse = await findSimilarCachedQuery(queryEmbedding, queryHash);
    
    if (similarResponse) {
      logger.info('Semantic cache hit for perplexity query', { queryHash });
      redisCache.recordStats('semantic_hit');
      return similarResponse;
    }
    
    redisCache.recordStats('miss');
    return null;
  } catch (error) {
    logger.error('Failed to check perplexity cache', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Store a query result in cache
 */
export async function storeCache(query: string, responseText: string) {
  const queryHash = hashQuery(query);
  const normalizedQuery = query.trim().toLowerCase();
  
  try {
    const queryEmbedding = await createEmbedding(normalizedQuery);
    const cacheEntry: CacheEntry = {
      response_text: responseText,
      query_embedding: queryEmbedding,
      created_at: new Date().toISOString()
    };
    
    await redisCache.set(`perplexity:${queryHash}`, cacheEntry);
    
    logger.info('Cached perplexity response', {
      queryHash,
      contentLength: responseText.length
    });
  } catch (error) {
    logger.warn('Error caching perplexity response', {
      error: error instanceof Error ? error.message : String(error),
      queryHash
    });
  }
} 