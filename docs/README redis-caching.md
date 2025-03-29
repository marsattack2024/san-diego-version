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

## Domain-specific Methods

### RAG-specific Caching

The `findSimilarDocumentsOptimized` function in `document-retrieval.ts` uses cache for RAG results:

```typescript
// Use the cacheService for RAG results, passing options with tenantId
const cachedResults = await cacheService.getRagResults<{
    documents: RetrievedDocument[],
    metrics: DocumentSearchMetrics
}>(queryText, { 
    tenantId, 
    metadataFilter: options.metadataFilter,
    limit: options.limit 
});
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

### Deep Search Caching

The `PerplexityService` implements caching for deep search results:

```typescript
// Check cache first to avoid unnecessary API calls
const cachedResults = await cacheService.getDeepSearchResults<PerplexitySearchResult>(query);
if (cachedResults) {
    edgeLogger.info("Using cached deep search results", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "perplexity_cache_hit"
    });
    
    return cachedResults;
}

// If no cache hit, perform the search and cache the result
const searchResult = await performDeepSearch(query);
await cacheService.setDeepSearchResults(query, searchResult);
```

## Diagnostic Tools

The application includes several debugging endpoints for cache management:

1. **Cache Inspector** (`/api/debug/cache-inspector`) - Advanced diagnostic tool
2. **Cache Test** (`/api/debug/cache-test`) - Testing different cache operations
3. **Cache Value Viewer** (`/api/debug/cache`) - Simple key value inspection
4. **Cache Repair** (`/api/debug/cache-repair`) - Fixes serialization issues

## Testing Strategy

The caching system is thoroughly tested through:

1. **Unit Tests** - Comprehensive tests for the `CacheService` class
2. **Integration Tests** - Testing integration with RAG, web scraper, etc.
3. **Mock Implementation** - In-memory mock for isolated testing
4. **Error Cases** - Testing behavior under error conditions

Example test from `cache-service.test.ts`:
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

## Future Enhancements

Potential areas for future improvement:

1. **Enhanced Analytics** - More detailed cache performance metrics
2. **Cache Prefetching** - Proactive caching of likely-to-be-requested data
3. **Distributed Cache Invalidation** - Selective invalidation of related cache entries
4. **Compression** - Compression for large cached values to save space
5. **Tiered Caching** - Multiple cache levels with different TTLs

## Migration Status

The standardization effort has been completed:

✅ All direct Redis client usage has been removed  
✅ Consistent key/TTL management is implemented  
✅ Serialization and deserialization are standardized  
✅ Error handling with fallbacks is in place  
✅ Edge compatibility is ensured  
✅ The legacy `chatEngineCache` service has been removed  

## Summary

The Redis caching system provides a robust, efficient, and serverless-friendly solution for various caching needs in the application. It follows best practices for key generation, error handling, and TTL management while providing specialized methods for different use cases.