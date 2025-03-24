import { Redis } from '@upstash/redis';
import {
  type LanguageModelV1,
  type LanguageModelV1Middleware,
  type LanguageModelV1StreamPart,
  simulateReadableStream,
  type LanguageModelV1CallOptions
} from 'ai';
import { edgeLogger } from '../logger/edge-logger';

// Initialize Redis client using environment variables
const redis = Redis.fromEnv();

// Cache configuration
const CACHE_CONFIG = {
  ttl: 3600, // 1 hour TTL for AI responses
  initialStreamDelay: 0,
  chunkStreamDelay: 10,
  maxKeySize: 1024 * 5 // 5KB max for cache keys
};

// Create a simple hash function that works in Edge Runtime
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string
  return Math.abs(hash).toString(16);
}

// Replace Node.js crypto with a simple hashing function for Edge compatibility
function createCacheKey(params: Record<string, any>): string {
  const key = JSON.stringify(params);
  
  // If key is too large, hash it
  if (key.length > CACHE_CONFIG.maxKeySize) {
    edgeLogger.warn('Cache key too large, using hash instead', {
      originalSize: key.length,
      maxSize: CACHE_CONFIG.maxKeySize
    });
    
    // Use our simple hash function instead of Node's crypto
    return `cache:${simpleHash(key)}`;
  }
  
  return key;
}

export const cacheMiddleware: LanguageModelV1Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const startTime = Date.now();
    const cacheKey = createCacheKey(params);
    
    try {
      // Check cache first
      const cached = await redis.get(cacheKey) as Awaited<
        ReturnType<LanguageModelV1['doGenerate']>
      > | null;

      if (cached !== null) {
        edgeLogger.info('Cache hit for AI generation', {
          operation: 'ai_generate_cache_hit',
          durationMs: Date.now() - startTime
        });
        
        // Format timestamps in cached response
        return {
          ...cached,
          response: {
            ...cached.response,
            timestamp: cached?.response?.timestamp
              ? new Date(cached.response.timestamp)
              : undefined,
          },
        };
      }

      // Cache miss - generate new response
      const result = await doGenerate();
      
      // Store in cache with TTL
      await redis.set(cacheKey, result, { ex: CACHE_CONFIG.ttl });
      
      edgeLogger.info('Cache miss for AI generation', {
        operation: 'ai_generate_cache_miss',
        durationMs: Date.now() - startTime
      });

      return result;
    } catch (error) {
      edgeLogger.error('AI cache error in generate', {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime
      });
      
      // Fallback to direct generation
      return await doGenerate();
    }
  },

  wrapStream: async ({ doStream, params }) => {
    const startTime = Date.now();
    const cacheKey = createCacheKey(params);
    
    try {
      // Check cache first
      const cached = await redis.get(cacheKey) as LanguageModelV1StreamPart[] | null;

      if (cached !== null) {
        edgeLogger.info('Cache hit for AI stream', {
          operation: 'ai_stream_cache_hit',
          durationMs: Date.now() - startTime
        });
        
        // Format timestamps in cached chunks
        const formattedChunks = cached.map(p => {
          if (p.type === 'response-metadata' && p.timestamp) {
            return { ...p, timestamp: new Date(p.timestamp) };
          }
          return p;
        });
        
        // Return simulated stream from cache
        return {
          stream: simulateReadableStream({
            initialDelayInMs: CACHE_CONFIG.initialStreamDelay,
            chunkDelayInMs: CACHE_CONFIG.chunkStreamDelay,
            chunks: formattedChunks,
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }

      // Cache miss - create new stream
      const { stream, ...rest } = await doStream();
      const fullResponse: LanguageModelV1StreamPart[] = [];

      // Transform stream to collect and cache chunks
      const transformStream = new TransformStream<
        LanguageModelV1StreamPart,
        LanguageModelV1StreamPart
      >({
        transform(chunk, controller) {
          fullResponse.push(chunk);
          controller.enqueue(chunk);
        },
        async flush() {
          // Store complete response in cache
          await redis.set(cacheKey, fullResponse, { ex: CACHE_CONFIG.ttl });
          
          edgeLogger.info('Cached AI stream response', {
            operation: 'ai_stream_cache_store',
            chunks: fullResponse.length,
            durationMs: Date.now() - startTime
          });
        },
      });

      edgeLogger.info('Cache miss for AI stream', {
        operation: 'ai_stream_cache_miss',
        durationMs: Date.now() - startTime
      });

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      };
    } catch (error) {
      edgeLogger.error('AI cache error in stream', {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime
      });
      
      // Fallback to direct streaming
      return await doStream();
    }
  },
}; 