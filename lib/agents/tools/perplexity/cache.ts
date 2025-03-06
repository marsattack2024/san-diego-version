import { createClient } from '../../../supabase/client.js';
import { createHash } from 'node:crypto';
import { clientLogger } from '../../../logger/client-logger.js';

// Create a component-specific logger wrapper
const logger = {
  debug: (message: string, context = {}) => clientLogger.debug(`[agent:tools:perplexity:cache] ${message}`, context),
  info: (message: string, context = {}) => clientLogger.info(`[agent:tools:perplexity:cache] ${message}`, context),
  warn: (message: string, context = {}) => clientLogger.warn(`[agent:tools:perplexity:cache] ${message}`, context),
  error: (message: string | Error, context = {}) => clientLogger.error(`[agent:tools:perplexity:cache] ${message}`, context)
};

// Initialize Supabase client
const supabase = createClient();

// Cache TTL - How long the cache entries remain valid
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a hash of the query for efficient caching
 */
export function hashQuery(query: string): string {
  return createHash('md5')
    .update(query.trim().toLowerCase())
    .digest('hex');
}

/**
 * Check if a query result exists in cache
 */
export async function checkCache(query: string) {
  const queryHash = hashQuery(query);
  const normalizedQuery = query.trim().toLowerCase();
  
  logger.debug('Checking perplexity cache', { queryHash });
  
  try {
    const { data: cacheHit, error } = await supabase
      .from('perplexity_cache')
      .select('response_text, created_at')
      .eq('query_hash', queryHash)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      logger.warn('Error checking perplexity cache', {
        error: error.message,
        code: error.code
      });
      return null;
    }
    
    if (cacheHit) {
      const createdAt = new Date(cacheHit.created_at).getTime();
      const now = Date.now();
      
      if (now - createdAt < CACHE_TTL) {
        logger.info('Cache hit for perplexity query', { queryHash });
        return cacheHit.response_text;
      }
      
      logger.info('Cache expired for perplexity query', { queryHash });
    }
    
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
    const { error } = await supabase
      .from('perplexity_cache')
      .upsert({
        query_hash: queryHash,
        query_text: normalizedQuery,
        response_text: responseText,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      logger.warn('Failed to cache perplexity response', {
        error: error.message,
        queryHash
      });
    } else {
      logger.info('Cached perplexity response', {
        queryHash,
        contentLength: responseText.length
      });
    }
  } catch (error) {
    logger.warn('Error caching perplexity response', {
      error: error instanceof Error ? error.message : String(error),
      queryHash
    });
  }
} 