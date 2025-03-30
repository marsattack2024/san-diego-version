# Redis Caching System

This document outlines the Redis caching architecture in our application, using Upstash Redis for its serverless-friendly design.

## Current Architecture

The application uses a standardized caching approach through a central `CacheService` class:

1. **Centralized Cache Service (`cacheService`)** - Core implementation in `lib/cache/cache-service.ts` with consistent interface.
2. **Domain-specific Methods** - Specialized methods for RAG results, web scraping, and deep search.
3. **Edge Compatibility** - Works in both Edge and Node.js environments with proper fallbacks.
4. **Complete Error Handling** - Graceful degradation with in-memory fallback when Redis is unavailable.
5. **Diagnostic Tools** - Debug endpoints in `/app/api/debug/cache/` and related routes.

## Architecture Overview

### Core Components

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

The service provides automatic fallback to in-memory caching when Redis is unavailable:

```typescript
function createInMemoryFallback() {
  const store = new Map<string, { value: any, expiry: number | null }>();
  
  edgeLogger.info('Creating in-memory cache fallback', {
    category: LOG_CATEGORIES.SYSTEM
  });
  
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
    }
  };
}
```

This implementation ensures:

1. **Automatic Detection** - Detects missing environment variables or connection failures
2. **Transparent Switch** - Applications using the cache service don't need to handle the fallback
3. **TTL Support** - In-memory implementation supports expiration just like Redis
4. **Proper Logging** - Logs when fallback is activated for monitoring

### Error Handling

Comprehensive error handling ensures the application remains functional even when caching fails:

1. **Connection Failures** - Automatically falls back to in-memory caching
2. **Operation Errors** - Individual operation failures are logged but don't throw exceptions
3. **Serialization Issues** - Handles parsing errors with appropriate logging
4. **Cache Repair Tools** - Debug endpoints to fix serialization issues

### Performance Monitoring

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

## Domain-specific Methods

### RAG-specific Caching

The `findSimilarDocumentsOptimized` function in `document-retrieval.ts` uses cache for RAG results:

```typescript
export async function findSimilarDocumentsOptimized(
    queryText: string,
    options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
    const ragOperationId = `rag-${Date.now().toString(36)}`;
    const startTime = performance.now();
    const tenantId = options.tenantId || 'global';

    try {
        // Use the cacheService for RAG results, passing options with tenantId
        const cachedResults = await cacheService.getRagResults<{
            documents: RetrievedDocument[],
            metrics: DocumentSearchMetrics
        }>(queryText, { 
            tenantId, 
            metadataFilter: options.metadataFilter,
            limit: options.limit 
        });

        if (cachedResults) {
            edgeLogger.info('Using cached RAG results', {
                operation: OPERATION_TYPES.RAG_SEARCH,
                ragOperationId,
                documentCount: cachedResults.documents.length,
                source: 'cache'
            });

            // Add fromCache flag for transparency
            return {
                ...cachedResults,
                metrics: {
                    ...cachedResults.metrics,
                    fromCache: true
                }
            };
        }

        // No valid cache hit, perform the search
        const documents = await findSimilarDocuments(queryText, options);
        const retrievalTimeMs = Math.round(performance.now() - startTime);

        // Calculate metrics
        const metrics = calculateSearchMetrics(documents, retrievalTimeMs);

        // Create result object
        const result = { documents, metrics };

        // Cache the results using the standardized approach
        await cacheService.setRagResults(queryText, result, {
            tenantId,
            metadataFilter: options.metadataFilter,
            limit: options.limit
        });

        return result;
    } catch (error) {
        // Error handling
    }
}
```

The implementation in `CacheService` handles complex query parameters:

```typescript
async getRagResults<T>(query: string, options?: any): Promise<T | null> {
  // Normalize inputs
  const normalizedQuery = query.toLowerCase().trim();
  
  // Create a stable representation of the query and options
  const keyContent = {
    q: normalizedQuery,
    opts: options || {}
  };
  
  // Generate a hash for the cache key
  const hashInput = this.stableStringify(keyContent);
  const hashedKey = await this.hashKey(hashInput);
  
  return this.get<T>(this.generateKey(hashedKey, CACHE_NAMESPACES.RAG));
}
```

### Web Scraper Caching

The `PuppeteerService` class caches scraped content:

```typescript
// Check cache first
const cachedContent = await cacheService.getScrapedContent(sanitizedUrl);
if (cachedContent) {
    // Use cached content
    return formatScrapedContent(cachedContent);
}

// If no cache hit, scrape the URL and then cache the result
const result = await this.callPuppeteerScraper(sanitizedUrl);
await cacheService.setScrapedContent(sanitizedUrl, JSON.stringify(result));
```

The implementation in `CacheService`:

```typescript
async getScrapedContent(url: string): Promise<string | null> {
  // Normalize URL
  const normalizedUrl = url.toLowerCase().trim();
  const hashedUrl = await this.hashKey(normalizedUrl);
  
  return this.get<string>(this.generateKey(hashedUrl, CACHE_NAMESPACES.SCRAPER));
}

async setScrapedContent(url: string, content: string): Promise<void> {
  // Normalize URL
  const normalizedUrl = url.toLowerCase().trim();
  const hashedUrl = await this.hashKey(normalizedUrl);
  
  return this.set<string>(
    this.generateKey(hashedUrl, CACHE_NAMESPACES.SCRAPER),
    content,
    { ttl: CACHE_TTL.SCRAPER }
  );
}
```

### Deep Search Caching

The `PerplexityService` implements caching for deep search results:

```typescript
public async search(query: string): Promise<PerplexitySearchResult> {
    const startTime = Date.now();
    const operationId = `perplexity-${Date.now().toString(36)}`;

    try {
        // Ensure the client is initialized before proceeding
        this.initialize();

        // Check cache first to avoid unnecessary API calls
        const cachedResults = await cacheService.getDeepSearchResults<PerplexitySearchResult>(query);
        if (cachedResults) {
            edgeLogger.info("Using cached deep search results", {
                category: LOG_CATEGORIES.TOOLS,
                operation: "perplexity_cache_hit",
                operationId,
                queryLength: query.length,
                responseLength: cachedResults.content.length
            });
            
            return cachedResults;
        }

        // API call implementation...

        // Create formatted result
        const searchResult: PerplexitySearchResult = {
            content,
            model: data.model,
            timing: { total: duration }
        };

        // Cache the search result
        await cacheService.setDeepSearchResults(query, searchResult);
        
        edgeLogger.debug("Perplexity result cached", {
            category: LOG_CATEGORIES.TOOLS,
            operation: "perplexity_result_cached",
            operationId,
            queryLength: query.length,
            responseLength: content.length
        });

        return searchResult;
    } catch (error) {
        // Error handling
    }
}
```

The implementation in `CacheService`:

```typescript
async getDeepSearchResults<T>(query: string): Promise<T | null> {
  try {
    // Normalize query
    const normalizedQuery = query.toLowerCase().trim();
    const hashedQuery = await this.hashKey(normalizedQuery);
    const key = this.generateKey(hashedQuery, CACHE_NAMESPACES.DEEP_SEARCH);
    const cachedData = await this.get<T>(key);
    
    if (cachedData) {
      edgeLogger.info('Cache hit for deep search query', { 
        category: LOG_CATEGORIES.SYSTEM, 
        service: 'cache-service', 
        query,
        key
      });
      return cachedData;
    }
    
    edgeLogger.info('Cache miss for deep search query', { 
      category: LOG_CATEGORIES.SYSTEM, 
      service: 'cache-service',
      query,
      key
    });
    return null;
  } catch (error) {
    edgeLogger.error('Error retrieving deep search results from cache', {
      category: LOG_CATEGORIES.SYSTEM,
      service: 'cache-service',
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}
```

## Diagnostic Tools

The application includes several debugging endpoints for cache management:

1. **Cache Inspector** (`/api/debug/cache-inspector`) - Advanced diagnostic tool
2. **Cache Test** (`/api/debug/cache-test`) - Testing different cache operations
3. **Cache Value Viewer** (`/api/debug/cache`) - Simple key value inspection
4. **Cache Repair** (`/api/debug/cache-repair`) - Fixes serialization issues

## Testing Strategy

The caching system is thoroughly tested through:

1. **Unit Tests** - Comprehensive tests for the `CacheService` class:
   ```typescript
   it('should set and get RAG results', async () => {
     const query = 'example RAG query';
     const results = { documents: [{ id: '1', content: 'test content' }] };
     const options = { tenantId: 'test' };
     
     await cacheService.setRagResults(query, results, options);
     const retrieved = await cacheService.getRagResults<typeof results>(query, options);
     
     expect(retrieved).toEqual(results);
   });
   ```

2. **Mock Implementation** - Dedicated mock implementation for testing:
   ```typescript
   export class MockRedisClient {
     private store = new Map<string, any>();
     private expirations = new Map<string, number>();
   
     async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
       this.store.set(key, value);
       
       // Set expiration if provided
       if (options?.ex) {
         const expiry = Date.now() + (options.ex * 1000);
         this.expirations.set(key, expiry);
       } else {
         this.expirations.delete(key);
       }
       
       return 'OK';
     }
   
     // Other methods...
   }
   ```

3. **Integration Tests** - Testing integration with RAG, web scraper, etc.
4. **Error Cases** - Testing behavior under error conditions

## Client-side Caching

The application also implements a client-side caching layer for browser environments:

```typescript
export const clientCache = {
  sessionStorage: typeof window !== 'undefined' ? window.sessionStorage : null,
  localStorage: typeof window !== 'undefined' ? window.localStorage : null,
  
  // Check if cache is available
  isAvailable(): boolean {
    return !!(this.sessionStorage || this.localStorage);
  },
  
  // Get storage for a specific key
  getStorageForKey(key: string): Storage | null {
    // Use sessionStorage for transient data, localStorage for persistent
    return key.startsWith('persist:') ? this.localStorage : this.sessionStorage;
  },
  
  // Get item from cache
  get(key: string): any {
    const storage = this.getStorageForKey(key);
    if (!storage) return null;
    
    try {
      // Get the stored item
      const item = storage.getItem(key);
      if (!item) return null;
      
      // Check if there's a custom TTL
      const ttlStr = storage.getItem(`${key}_ttl`);
      if (ttlStr) {
        const ttl = parseInt(ttlStr, 10);
        const timestamp = parseInt(storage.getItem(`${key}_timestamp`) || '0', 10);
        
        // Check if expired
        if (Date.now() > timestamp + ttl) {
          this.remove(key);
          return null;
        }
      }
      
      // Parse and return the item
      return JSON.parse(item);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },
  
  // Additional methods for set, remove, clear, etc.
}
```

This client-side implementation:
- Provides TTL support similar to the server implementation
- Handles storage quotas by clearing old items when needed
- Differentiates between session and persistent storage
- Includes proper error handling

## Future Enhancements

Potential areas for future improvement:

1. **Enhanced Analytics** - More detailed cache performance metrics
2. **Cache Prefetching** - Proactive caching of likely-to-be-requested data
3. **Distributed Cache Invalidation** - Selective invalidation of related cache entries
4. **Compression** - Compression for large cached values to save space
5. **Tiered Caching** - Multiple cache levels with different TTLs
6. **Advanced Client-side Integration** - Tighter integration between server and client caches
7. **Circuit Breaker Pattern** - Smart degradation for Redis errors
8. **Key Eviction Policies** - Custom eviction strategies beyond TTL

## Migration Status

The standardization effort has been completed:

✅ All direct Redis client usage has been removed  
✅ Consistent key/TTL management is implemented  
✅ Serialization and deserialization are standardized  
✅ Error handling with fallbacks is in place  
✅ Edge compatibility is ensured  
✅ The legacy `chatEngineCache` service has been removed  
✅ Performance monitoring and logging implemented

## Summary

The Redis caching system provides a robust, efficient, and serverless-friendly solution for various caching needs in the application. It follows best practices for key generation, error handling, and TTL management while providing specialized methods for different use cases. The implementation ensures:

1. **Reliability** - With in-memory fallbacks when Redis is unavailable
2. **Performance** - Through optimized key generation and consistent serialization
3. **Maintainability** - Via centralized configuration and specialized methods
4. **Observability** - With comprehensive logging and diagnostic endpoints
5. **Compatibility** - Working in both Edge and Node.js environments