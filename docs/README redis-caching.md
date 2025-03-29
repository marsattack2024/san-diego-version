# Redis Caching System

This document outlines the standardization of Redis caching in our application, using Upstash Redis for its serverless-friendly architecture.

## Current Architecture Analysis

The application currently uses Redis in several ways:

1. **Direct Redis Client (`redisCache`)** - Used in `document-retrieval.ts` for caching RAG results.
2. **`chatEngineCache` Service** - Built on top of `redisCache`, used in `puppeteer.service.ts` for web scraper content caching.
3. **Debug Endpoints** - For inspecting cache values (`/app/api/debug/cache/route.ts`).
4. **Missing Caching Opportunities** - Services such as `perplexity.service.ts` and `deep-search.ts` have already implemented caching using the new standardized `cacheService`.

## MVP Plan: Single `CacheService`

### Goal
Create a single `CacheService` to consolidate caching logic.

### Specific Objectives
- ✅ Eliminate direct `redisCache` usage
- ✅ Ensure consistent key/TTL management 
- ✅ Standardize serialization/deserialization
- ✅ Implement proper error handling with fallbacks
- ✅ Create Edge-compatible implementation

### Files Created
- ✅ `/lib/cache/cache-service.ts` - `CacheService` class with standardized interface
- ✅ `/lib/cache/constants.ts` - Central TTL values and namespace prefixes
- ✅ `/app/api/debug/cache-test/route.ts` - Test endpoint for validating service

### Files Modified
- ✅ `/lib/services/vector/document-retrieval.ts` - Updated to use `cacheService` for RAG results
- ✅ `/app/api/debug/cache/route.ts` - Updated debug endpoint to use standardized cache service
- ✅ `/app/api/debug/cache-inspector/route.ts` - Added additional endpoints for cache analysis
- ✅ `/lib/services/perplexity.service.ts` - Already using the standardized caching approach

### Files to Deprecate
- 🔲 `/lib/chat-engine/cache-service.ts` - Legacy implementation to be marked for deprecation

## Implementation Plan

### Phase 1: Core Implementation ✅ COMPLETE
- ✅ Create constants module with TTL values and namespace prefixes
- ✅ Implement `CacheService` with proper error handling and logging
- ✅ Add support for in-memory fallback
- ✅ Create test endpoint to validate implementation
- ✅ Update documentation

### Phase 2: Migrate Existing Code ✅ COMPLETE
- ✅ Update `document-retrieval.ts` to use new cache service for RAG results
- ✅ Create unit tests for document retrieval with cache
- ✅ Update `route.ts` debug endpoint to use new cache service
- ✅ Verify existing cache implementations in `perplexity.service.ts`

### Phase 3: Testing and Validation ✅ COMPLETE
- ✅ Comprehensive unit tests
- ✅ Mock implementations for testing
- ✅ Error handling tests
- ✅ Key generation and transformation tests

### Phase 4: Clean-up and Documentation 🔲 IN PROGRESS
- 🔲 Remove legacy implementations
- ✅ Finalize documentation
- 🔲 Create examples for common use cases

## Testing Methodology

The Redis caching system is thoroughly tested using our standardized Vitest testing framework. Key aspects of the testing strategy include:

### Unit Tests
- ✅ **Basic Operations**: Tests for `get`, `set`, `delete`, and `exists` methods
- ✅ **Domain-specific Functions**: Tests for `getRagResults`, `setRagResults`, `getScrapedContent`, etc.
- ✅ **Error Handling**: Tests verifying graceful degradation under error conditions
- ✅ **Key Generation**: Tests for consistent key generation across different inputs

### Test Mocking Approach
- ✅ **Redis Client Mocking**: In-memory implementation for isolated testing
- ✅ **Error Injection**: Simulating Redis failures to test fallback mechanisms
- ✅ **Cache Service Mocking**: For testing services that consume the cache

### Integration Points Tested
- ✅ **Document Retrieval**: Verified caching of RAG results
- ✅ **Web Scraper**: Tested caching of scraped content
- ✅ **Debug Endpoints**: Confirmed proper functionality of cache inspection tools

Example test case for the document retrieval service:
```typescript
it('should return cached results when available', async () => {
  // Mock cached RAG results
  const cachedResult = {
    documents: [
      { id: '1', content: 'Paris is the capital of France', score: 0.95 }
    ],
    metrics: {
      count: 1,
      averageSimilarity: 0.95,
      highestSimilarity: 0.95,
      lowestSimilarity: 0.95,
      retrievalTimeMs: 50,
      isSlowQuery: false
    }
  };
  
  vi.mocked(cacheService.getRagResults).mockResolvedValue(cachedResult);
  
  const result = await findSimilarDocumentsOptimized(SAMPLE_QUERY);
  
  // Verify correct cache key generation
  expect(cacheService.getRagResults).toHaveBeenCalledWith(
    SAMPLE_QUERY, 
    expect.objectContaining({ tenantId: 'global' })
  );
  
  // Verify returned results include cache flag
  expect(result.documents).toEqual(cachedResult.documents);
  expect(result.metrics).toEqual({
    ...cachedResult.metrics,
    fromCache: true
  });
});
```

## Key Transformation Strategy

To generate reliable cache keys, we follow these steps:

1. **Normalize**: Transform complex inputs into a consistent format
   - For RAG queries: `{ q: query, opts: options }`
   - For URLs: Normalize, remove trailing slashes, etc.

2. **Serialize**: Use stable JSON serialization (sorted keys)
   - Ensures consistent results regardless of object property order

3. **Hash**: Apply SHA-1 hashing (truncated to 64 bits)
   - Edge-compatible via Web Crypto API
   - Provides fixed-length keys regardless of input size
   - Reduces collision probability while keeping keys short

This strategy ensures compatibility across all runtime environments (Edge, Node.js), while maintaining reliable and consistent cache behavior.

## Future Enhancements

Potential areas for future enhancement:

1. **Cache Analytics**: Comprehensive monitoring dashboard for cache performance
2. **Automatic Cache Warming**: Proactively cache frequently accessed data
3. **Cache Invalidation Strategies**: Methods to selectively invalidate related cache entries
4. **Distributed Locks**: For handling race conditions in high-concurrency scenarios
5. **Cache Compression**: For optimizing storage of large cached values

## Summary

This MVP plan has successfully standardized Redis caching with minimal complexity, providing immediate benefits while establishing a foundation for future enhancements. The implementation is fully tested and validated, with comprehensive documentation to guide developers using the cache service.