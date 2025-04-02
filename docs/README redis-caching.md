# Redis Caching System

This document outlines the Redis caching architecture in our application, using Upstash Redis for its serverless-friendly design.

## Current Architecture

The application uses a standardized caching approach through a central `CacheService` class and unified Redis client:

1. **Standardized Redis Client** - Unified client implementation in `lib/utils/redis-client.ts` provides consistent connection handling across the application
2. **Centralized Cache Service (`cacheService`)** - Core implementation in `lib/cache/cache-service.ts` with consistent interface
3. **Domain-specific Methods** - Specialized methods for RAG results, web scraping, and deep search
4. **Edge Compatibility** - Works in both Edge and Node.js environments with proper fallbacks
5. **Complete Error Handling** - Graceful degradation with in-memory fallback when Redis is unavailable
6. **Diagnostic Tools** - Debug endpoints in `/app/api/debug/cache/` and enhanced Redis test utilities in `/app/api/debug/redis-test/`

## Standardized Redis Client

The application now uses a standardized Redis client implementation to ensure consistent connection handling, error recovery, and configuration across the entire codebase.

### Key Features

- **Singleton Pattern** - Provides a shared Redis client instance to minimize connection overhead
- **Connection Priority** - Attempts connections in a consistent order:
  1. Vercel KV REST API (`KV_REST_API_URL` + `KV_REST_API_TOKEN`)
  2. Upstash Redis REST API (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
  3. Redis URL (`REDIS_URL`)
  4. Standard Redis connection parameters (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`)
- **Automatic Fallback** - Switches to in-memory implementation when Redis is unavailable
- **Comprehensive Error Handling** - Graceful error recovery with detailed logging
- **Complete API Compatibility** - Implements all Redis methods needed by the application

### Implementation

The Redis client is implemented in `lib/utils/redis-client.ts` and provides these key functions:

```typescript
// Get the shared Redis client instance (singleton pattern)
export async function getRedisClient(): Promise<Redis | any> {
  if (!redisClientPromise) {
    redisClientPromise = createRedisClient();
  }
  
  return redisClientPromise;
}

// Create a fresh Redis client (for specialized use cases)
export async function createFreshRedisClient(): Promise<Redis | any> {
  return createRedisClient();
}

// Reset the Redis client singleton (useful for testing or recovery)
export function resetRedisClient(): void {
  redisClientPromise = null;
}
```

### Connection Management

The client implements a robust connection strategy with detailed logging:

```typescript
async function createRedisClient(): Promise<Redis | any> {
  // Check for connection details with specific priority
  const kvRestUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvRestToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  
  // Log initialization with environment details
  edgeLogger.info('Initializing Redis client', {
    category: LOG_CATEGORIES.SYSTEM,
    operation: 'redis_init',
    envVarsPresent: {
      KV_REST_API_URL: !!kvRestUrl,
      KV_REST_API_TOKEN: !!kvRestToken,
      REDIS_URL: !!redisUrl,
      REDIS_HOST: !!redisHost
    }
  });
  
  try {
    // Try connections in priority order with complete error handling
    // Falls back to in-memory implementation when needed
  } catch (error) {
    // Detailed error logging and graceful fallback
  }
}
```

### Integration Points

The standardized Redis client has been integrated with:

1. **Cache Service** (`lib/cache/cache-service.ts`) - Primary interface for all caching operations
2. **Rate Limiting** (`lib/widget/rate-limit.ts`) - For distributed rate limiting
3. **Debug Endpoints** - For cache inspection, repair, and testing

## Architecture Overview

### Core Components

- **`redis-client.ts`** - Standardized Redis client implementation
- **`CacheService` Class** - Primary interface for all caching operations
- **`constants.ts`** - Centralized TTL values and namespace prefixes
- **Edge-compatible Key Generation** - Using Web Crypto API for consistent hashing
- **In-memory Fallback** - Automatic fallback when Redis is unavailable
- **Comprehensive Logging** - Structured logging for all cache operations
- **Performance Monitoring** - Hit/miss stats tracking and periodic logging
- **Environment Detection** - Runtime detection for Edge vs Node.js environments

### Integration Points

The cache service is integrated with these key application components:

1. **RAG System** (`document-retrieval.ts`) - Caches vector search results
2. **Web Scraper** (`puppeteer.service.ts`) - Caches scraped web content
3. **Deep Search** (`perplexity.service.ts`) - Caches Perplexity API responses
4. **Chat Title Generator** (`title-service.ts`) - Caches generated conversation titles
5. **Rate Limiting** (`rate-limit.ts`) - For widget chat rate limiting

### Cache Namespaces

The caching system uses distinct namespaces to organize different types of data:

```typescript
export const CACHE_NAMESPACES = {
  DEFAULT: 'app',              // Default namespace
  RAG: 'rag',                  // RAG results
  SCRAPER: 'scrape',           // Web scraper content
  EMBEDDINGS: 'embedding',     // Embeddings
  CONTEXT: 'context',          // Context
  DEEP_SEARCH: 'deepsearch',   // Deep search results
};
```

### TTL Management

Cache expiration is managed through centralized TTL constants:

```typescript
export const CACHE_TTL = {
  RAG_RESULTS: 12 * 60 * 60,     // 12 hours for RAG results
  SCRAPER: 12 * 60 * 60,         // 12 hours for web scraper content
  EMBEDDINGS: 7 * 24 * 60 * 60,  // 7 days for embeddings
  CONTEXT: 24 * 60 * 60,         // 1 day for context
  DEEP_SEARCH: 1 * 60 * 60,      // 1 hour for deep search results
  SHORT: 1 * 60 * 60,            // 1 hour for short-lived cache items
};
```

## Implementation Details

### Key Generation Strategy

The cache service implements a robust key generation strategy:

1. **Namespace Prefixing** - All keys are prefixed with their namespace (`namespace:key`)
2. **Input Normalization** - Complex inputs (objects, arrays) are normalized through stable serialization
3. **Hashing** - SHA-1 hashing via Web Crypto API creates fixed-length keys
4. **Truncation** - Hash is truncated to 16 characters (64 bits) for efficiency

Example from `cache-service.ts`:
```typescript
private async hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Truncate to 16 characters (64 bits)
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
```

### In-memory Fallback

The Redis client provides automatic fallback to in-memory implementation when Redis is unavailable:

```typescript
function createInMemoryFallback() {
  const store = new Map<string, { value: any, expiry: number | null }>();
  
  edgeLogger.info('Creating in-memory cache fallback', {
    category: LOG_CATEGORIES.SYSTEM,
    operation: 'redis_fallback_init'
  });
  
  // Implement Redis-compatible interface with in-memory storage
  return {
    async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
      const expiry = options?.ex ? Date.now() + (options.ex * 1000) : null;
      store.set(key, { value, expiry });
      return 'OK';
    },
    
    async get(key: string): Promise<any> {
      const item = store.get(key);
      if (!item) return null;
      
      if (item.expiry && item.expiry < Date.now()) {
        store.delete(key);
        return null;
      }
      
      return item.value;
    },
    
    async del(key: string): Promise<number> {
      const deleted = store.delete(key);
      return deleted ? 1 : 0;
    },
    
    async exists(key: string): Promise<number> {
      const item = store.get(key);
      if (!item) return 0;
      
      if (item.expiry && item.expiry < Date.now()) {
        store.delete(key);
        return 0;
      }
      
      return 1;
    },
    
    async eval(): Promise<any> {
      // Simple stub for eval
      return 0;
    },
    
    async ttl(): Promise<number> {
      // Simple stub for ttl
      return 0;
    }
  };
}
```

This implementation ensures:

1. **Automatic Detection** - Detects missing environment variables or connection failures
2. **Transparent Switch** - Applications using the cache service don't need to handle the fallback
3. **TTL Support** - In-memory implementation supports expiration just like Redis
4. **Proper Logging** - Logs when fallback is activated for monitoring
5. **API Compatibility** - Implements all required Redis methods used by the application

### Diagnostic Utilities

The application now includes enhanced Redis diagnostic tools:

1. **Redis Test Endpoint** (`/api/debug/redis-test`) - Tests Redis connectivity and reports detailed results
2. **Cache Inspector** (`/api/debug/cache-inspector`) - Inspects cached values with parsing diagnostics
3. **Cache Repair** (`/api/debug/cache-repair`) - Fixes serialization issues in cached values

Example of using the Redis test endpoint:
```
# Test the singleton Redis client
GET /api/debug/redis-test

# Test with a fresh Redis client instance
GET /api/debug/redis-test?mode=fresh

# Reset the Redis client singleton and test
GET /api/debug/redis-test?reset=true
```

Response includes detailed diagnostic information:
```json
{
  "success": true,
  "mode": "singleton",
  "reset": false,
  "metrics": {
    "totalTimeMs": 123
  },
  "tests": {
    "writeSuccessful": true,
    "readSuccessful": true,
    "readValueCorrect": true,
    "deletionSuccessful": true
  },
  "client": {
    "implementation": "redis",
    "mode": "singleton"
  },
  "environment": {
    "KV_REST_API_URL": true,
    "KV_REST_API_TOKEN": true,
    "REDIS_URL": true,
    "REDIS_TOKEN": false,
    "VERCEL_ENV": "development"
  }
}
```

## Performance Monitoring

The cache service includes built-in performance monitoring:

```typescript
// In the CacheService class
private stats = { hits: 0, misses: 0, lastLoggedAt: Date.now() };

// In the get() method
async get<T>(key: string): Promise<T | null> {
  const fullKey = this.generateKey(key);
  try {
    const redis = await this.redisPromise;
    const value = await redis.get(fullKey);
    
    // Update stats
    if (value !== null) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    
    // Log stats periodically
    const totalOps = this.stats.hits + this.stats.misses;
    if (totalOps % 20 === 0 || Date.now() - this.stats.lastLoggedAt > 60000) {
      edgeLogger.info('Cache stats', {
        category: LOG_CATEGORIES.SYSTEM,
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: totalOps > 0 ? this.stats.hits / totalOps : 0
      });
      this.stats.lastLoggedAt = Date.now();
    }
    
    return value as T;
  } catch (error) {
    // Error handling
  }
}
```

This provides:
- Automatic tracking of cache hits and misses
- Periodic logging of cache performance metrics
- Hit rate calculation for monitoring efficiency
- Detailed logging for troubleshooting

## Best Practices for Using Redis

### 1. Always use the Standardized Client

```typescript
// Import from the standardized location
import { getRedisClient } from '@/lib/utils/redis-client';

// Use the shared client instance
const redis = await getRedisClient();

// Or create a fresh client for specialized cases
const freshRedis = await createFreshRedisClient();
```

### 2. Use the Cache Service for Business Logic

```typescript
import { cacheService } from '@/lib/cache/cache-service';

// Basic caching
await cacheService.set('my-key', myValue, { ttl: 3600 });
const value = await cacheService.get('my-key');

// Domain-specific caching
await cacheService.setRagResults(query, ragResults);
const cachedResults = await cacheService.getRagResults(query);
```

### 3. Implement Proper Error Handling

```typescript
try {
  const value = await cacheService.get('my-key');
  // Use the value if available
} catch (error) {
  // Log the error but continue - don't let cache failures break the application
  logger.error('Cache error', { error });
  // Proceed with a fallback approach
}
```

### 4. Add New Cache Methods to the Service

When adding new cached content types, extend the `CacheService` interface and implementation rather than accessing Redis directly:

```typescript
// In cache-service.ts
export interface CacheServiceInterface {
  // Existing methods...
  
  // Add new methods
  getMyNewContentType(id: string): Promise<MyType | null>;
  setMyNewContentType(id: string, content: MyType): Promise<void>;
}
```

## Troubleshooting

### Connection Issues

If Redis connection issues are detected:

1. **Check Environment Variables** - Verify correct configuration in `.env` or Vercel dashboard
2. **Run Redis Test** - Use `/api/debug/redis-test` endpoint to diagnose connection issues
3. **Check Logs** - Look for `redis_init` operation logs with connection results
4. **Verify Network Rules** - Ensure no firewall or network rules blocking Redis access
5. **Test Redis Directly** - Use Redis CLI or dashboard to verify access to the instance

### Serialization Issues

For serialization issues (double stringification, etc.):

1. **Inspect Value** - Use `/api/debug/cache-inspector?key=your-key` to examine the cached value
2. **Repair Value** - Use `/api/debug/cache-repair?key=your-key` to fix serialization issues
3. **Check Serialization** - Review code that serializes values before caching
4. **Update Application Code** - Fix improper JSON stringification in your application

### Performance Issues

For performance concerns:

1. **Review Logs** - Check cache hit/miss rates in the logs
2. **Analyze TTL** - Consider adjusting TTL values in `constants.ts` based on data freshness needs
3. **Optimize Key Generation** - Review key generation patterns for high-cardinality issues
4. **Consider ZSET** - For time-series data, consider using Redis ZSET instead of simple keys