# Redis Caching System Documentation

## Overview

This document outlines the Redis caching implementation used in our application. We use Upstash Redis for its serverless-friendly architecture, low latency, and per-request pricing model. The caching system is designed to optimize AI interactions by reducing duplicate API calls, database queries, and web requests, while providing consistent fallback mechanisms for reliability.

## Current Architecture Analysis

The current Redis caching implementation has evolved with two parallel approaches:

1. **Low-level Direct Redis Client** (`redisCache` from `/lib/cache/redis-client.ts`):
   - Used directly by `document-retrieval.ts` for RAG results caching
   - Has specialized methods for different data types
   - Includes fallback to in-memory storage when Redis is unavailable
   - Implements detailed logging and metrics

2. **High-level Cache Service** (`chatEngineCache` from `/lib/chat-engine/cache-service.ts`):
   - Built on top of `redisCache`
   - Adds namespacing and consistent key generation
   - Used by `puppeteer.service.ts` and `core.ts`
   - Provides domain-specific methods with proper TTL management

### Issues with Current Implementation

1. **Inconsistent Usage**: Some services use `redisCache` directly while others use `chatEngineCache`
2. **Duplicate Cache Implementations**: Similar caching logic is duplicated across files
3. **Inconsistent Key Generation**: Different key generation strategies between implementations
4. **Lack of Standardized TTLs**: TTL constants defined in multiple places
5. **Redundant Boilerplate**: Error handling and logging duplicated across files
6. **No Clear Contract**: Lack of defined TypeScript interfaces for cache operations

## Standardization Plan

To address these issues, we will implement a standardized caching approach across the entire application.

### Phase 1: Unified Cache Service Creation

#### Goals
- Create a truly application-agnostic cache service abstraction
- Provide comprehensive, strongly-typed interfaces
- Ensure proper error handling, logging, and fallback mechanisms

#### Implementation Steps

1. **Create a new `CacheService` class**
   - Location: `/lib/cache/cache-service.ts`
   - Designed to be application-agnostic with no chat-specific assumptions
   - Implements all necessary low-level and domain-specific caching operations
   - Supports dependency injection pattern

2. **Define Clear TypeScript Interfaces**
   - Create a `CacheServiceInterface` to define the contract
   - Provide comprehensive type safety for all operations
   - Document expected behavior for all methods

3. **Centralize Constants and Helpers**
   - Move all TTL values to `/lib/cache/constants.ts`
   - Implement standardized key generation with appropriate hash algorithms
   - Document all namespacing conventions

4. **Implement Robust Error Handling**
   - Create specific `CacheError` types for different failure modes
   - Provide comprehensive logging for all operations
   - Implement circuit breaker pattern for transient failures

5. **Add Monitoring and Metrics**
   - Implement detailed stats tracking
   - Provide configurable logging levels
   - Support OpenTelemetry for performance monitoring

#### Example Implementation: Core Interface

```typescript
// lib/cache/interfaces.ts
export interface CacheServiceInterface {
  // Generic CRUD operations
  get<T>(key: string, options?: CacheOptions): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string, options?: CacheOptions): Promise<void>;
  exists(key: string, options?: CacheOptions): Promise<boolean>;
  
  // Domain-specific operations
  getEmbedding(query: string): Promise<number[] | null>;
  setEmbedding(query: string, embedding: number[]): Promise<void>;
  
  getRagResults<T>(query: string, options?: any): Promise<T | null>;
  setRagResults<T>(query: string, result: T, options?: any): Promise<void>;
  
  getScrapedContent(url: string): Promise<string | null>;
  setScrapedContent(url: string, content: string): Promise<void>;
  
  getDeepSearchResults<T>(query: string): Promise<T | null>;
  setDeepSearchResults<T>(query: string, results: T): Promise<void>;
  
  // Additional domain methods as needed
}

export interface CacheOptions {
  namespace?: string;
  ttl?: number;
  tags?: string[];
}

export class CacheError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly key: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CacheError';
  }
}
```

### Phase 2: Test Suite Development

#### Goals
- Ensure reliability of the new cache service
- Validate behavior for all edge cases
- Enable test-driven development for future iterations

#### Implementation Steps

1. **Create Unit Test Suite**
   - Test all basic operations (get, set, delete)
   - Validate key generation consistency
   - Test TTL behavior and namespace isolation
   - Verify error handling for various failure modes

2. **Implement Integration Tests**
   - Test Redis connection and fallback mechanisms
   - Validate serialization/deserialization of complex objects
   - Test performance characteristics

3. **Create Mock Implementation**
   - Provide a testable in-memory implementation
   - Simulate various error conditions
   - Support testing without Redis dependency

#### Example Test Case

```typescript
// lib/cache/__tests__/cache-service.test.ts
describe('CacheService', () => {
  let cacheService: CacheService;
  
  beforeEach(() => {
    // Initialize with a test-specific namespace
    cacheService = new CacheService('test');
  });
  
  afterEach(async () => {
    // Clean up test keys
    const testKeys = await cacheService.keys('test:*');
    await Promise.all(testKeys.map(key => cacheService.delete(key)));
  });
  
  test('set and get operations work correctly', async () => {
    const key = 'test-key';
    const value = { data: 'test-value' };
    
    await cacheService.set(key, value);
    const retrieved = await cacheService.get<typeof value>(key);
    
    expect(retrieved).toEqual(value);
  });
  
  test('handles TTL correctly', async () => {
    const key = 'ttl-test';
    await cacheService.set(key, 'value', { ttl: 1 }); // 1 second TTL
    
    // Should exist immediately
    expect(await cacheService.exists(key)).toBe(true);
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should not exist after TTL expires
    expect(await cacheService.exists(key)).toBe(false);
  });
  
  // Additional test cases for other functionality...
});
```

### Phase 3: Migration Strategy

#### Goals
- Transition services away from direct `redisCache` usage
- Maintain backward compatibility during transition
- Ensure consistent caching behavior across the application

#### Implementation Steps

1. **Create Application Cache Service Factory**
   - Provide a factory function to create properly configured cache service instances
   - Support both singleton pattern and dependency injection
   - Ensure consistent configuration across the application

2. **Update Vector Search First**
   - Modify `document-retrieval.ts` to use the new `CacheService`
   - Adapt existing calls to use standardized methods
   - Verify performance and correctness

3. **Update Chat Engine Components**
   - Modify `chat-engine/core.ts` to use the new `CacheService`
   - Update tool implementations to use standardized methods
   - Maintain backward compatibility

4. **Handle Backward Compatibility**
   - Create shims/adapters for existing code
   - Add deprecation warnings to direct `redisCache` usage
   - Maintain support for both patterns during transition

#### Example Implementation: Vector Search Migration

```typescript
// lib/services/vector/document-retrieval.ts
import { getCacheService } from '@/lib/cache/factory';

// Get the application cache service (either singleton or injected)
const cacheService = getCacheService();

export async function findSimilarDocumentsOptimized(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  try {
    // Using the standardized method for RAG results
    const cachedResults = await cacheService.getRagResults<{
      documents: RetrievedDocument[],
      metrics: DocumentSearchMetrics
    }>(queryText, options);
    
    if (cachedResults) {
      return cachedResults;
    }
    
    // Perform the search operation
    const result = await performSearch(queryText, options);
    
    // Cache using standardized method
    await cacheService.setRagResults(queryText, result, options);
    
    return result;
  } catch (error) {
    // Handle and log errors
    if (error instanceof CacheError) {
      // Handle cache-specific errors
    }
    
    // Fall back to uncached search
    return performSearch(queryText, options);
  }
}
```

### Phase 4: Implementation and Cleanup

#### Goals
- Complete the transition to the standardized cache service
- Remove deprecated code and patterns
- Ensure consistent documentation and usage examples

#### Implementation Steps

1. **Finalize Service Implementation**
   - Address any issues found during migration
   - Optimize performance-critical paths
   - Ensure all edge cases are handled

2. **Remove Deprecated Code**
   - Gradually remove direct `redisCache` usage
   - Clean up redundant implementations
   - Remove unnecessary compatibility layers

3. **Update Documentation**
   - Update this document with final architecture
   - Create usage examples for common scenarios
   - Document best practices and patterns

4. **Implement Monitoring Dashboards**
   - Create monitoring dashboards for cache performance
   - Set up alerts for cache failures
   - Track cache hit ratios and performance metrics

#### Cache Factory Implementation

```typescript
// lib/cache/factory.ts
import { CacheService, CacheServiceInterface } from './cache-service';

// Singleton instance (for non-DI use cases)
let globalCacheService: CacheServiceInterface | null = null;

/**
 * Get the application cache service
 * Supports both singleton pattern and dependency injection
 */
export function getCacheService(options?: {
  namespace?: string;
  forceNew?: boolean;
}): CacheServiceInterface {
  const { namespace = 'app', forceNew = false } = options || {};
  
  // Return existing singleton unless forced to create new
  if (!forceNew && globalCacheService) {
    return globalCacheService;
  }
  
  // Create new instance with application defaults
  const cacheService = new CacheService(namespace);
  
  // Store singleton if not forcing new instance
  if (!forceNew) {
    globalCacheService = cacheService;
  }
  
  return cacheService;
}
```

## Cache Service Architecture

Our standardized `CacheService` follows best practices for caching in serverless environments:

### Core Components

```
┌─────────────────┐      ┌───────────────────┐      ┌────────────────┐
│                 │      │                   │      │                │
│ Application     │◄────►│ Cache Service     │◄────►│ Redis/Fallback │
│ Services        │      │ (CacheService)    │      │ (Implementation)│
│                 │      │                   │      │                │
└─────────────────┘      └───────────────────┘      └────────────────┘
        │                        ▲                           ▲
        │                        │                           │
        ▼                        │                           │
┌─────────────────┐              │                           │
│                 │              │                           │
│ API Route       │              │                           │
│ Handlers        │              │                           │
│                 │              │                           │
└─────────────────┘              │                           │
                                 │                           │
                                 │                           │
                          ┌──────┴───────┐      ┌────────────┴───────┐
                          │              │      │                    │
                          │ Vector       │      │ Tools              │
                          │ Services     │      │ (KB, DS, WS)       │
                          │              │      │                    │
                          └──────────────┘      └────────────────────┘
```

1. **Cache Service Interface** (`lib/cache/interfaces.ts`): Defines the contract for all cache operations.

2. **Cache Service Implementation** (`lib/cache/cache-service.ts`): Provides the concrete implementation with appropriate error handling and fallback mechanisms.

3. **Cache Factory** (`lib/cache/factory.ts`): Creates properly configured cache service instances with application defaults.

4. **Cache Constants** (`lib/cache/constants.ts`): Centralizes TTL values, namespace conventions, and other configuration.

### Key Principles

1. **Dependency Injection**: Services accept a `CacheServiceInterface` in their constructor.
2. **Namespace Isolation**: Different services use different namespaces to avoid key collisions.
3. **Centralized TTL Management**: TTL values are defined in one place for consistency.
4. **Standardized Key Generation**: Key generation follows consistent patterns.
5. **Comprehensive Error Handling**: Cache errors are properly typed and handled.

### Example Usage

```typescript
// In a service class
export class DocumentService {
  constructor(
    private cacheService: CacheServiceInterface = getCacheService({ namespace: 'documents' })
  ) {}
  
  async getDocument(id: string): Promise<Document | null> {
    // Try cache first
    const cached = await this.cacheService.get<Document>(`doc:${id}`);
    if (cached) {
      return cached;
    }
    
    // Fetch from database
    const document = await this.database.findDocument(id);
    if (document) {
      // Cache for future requests
      await this.cacheService.set(`doc:${id}`, document, { ttl: CACHE_TTL.DOCUMENT });
    }
    
    return document;
  }
}
```

## Configuration

### Environment Variables

The system requires the following environment variables:
- `UPSTASH_REDIS_REST_URL` - The Upstash Redis REST API URL 
- `UPSTASH_REDIS_REST_TOKEN` - The authentication token for Upstash Redis

**Optional Configuration Variables**:
- `CACHE_ENABLED` - Set to 'false' to disable caching (default: true)
- `CACHE_DEFAULT_TTL` - Default TTL in seconds (default: 43200 - 12 hours)
- `CACHE_LOG_LEVEL` - Logging level for cache operations (default: 'info')

### Cache TTL Settings

```typescript
// lib/cache/constants.ts
export const CACHE_TTL = {
  EMBEDDINGS: 7 * 24 * 60 * 60, // 7 days
  DOCUMENT: 24 * 60 * 60,       // 1 day
  RAG_RESULTS: 12 * 60 * 60,    // 12 hours
  SCRAPER: 12 * 60 * 60,        // 12 hours
  DEEP_SEARCH: 1 * 60 * 60,     // 1 hour (shorter for dynamic web content)
  PROMPT: 30 * 24 * 60 * 60,    // 30 days
  CONTEXT: 24 * 60 * 60,        // 1 day
  MESSAGE: 7 * 24 * 60 * 60,    // 7 days
  SESSION: 30 * 24 * 60 * 60,   // 30 days
  SHORT: 1 * 60 * 60,           // 1 hour
};
```

## Key Caching Implementations

### 1. RAG (Retrieval Augmented Generation) Caching

The knowledge base tool uses Redis caching to avoid redundant vector searches:

#### Cache Keys for RAG:

```
app:rag:{hash_of_query_and_options}
```

#### Implementation:

```typescript
// Using standardized cache service
async getRagResults<T>(query: string, options?: any): Promise<T | null> {
  const key = await this.generateCacheKey(
    JSON.stringify({
      query: query.toLowerCase().trim(),
      options
    })
  );
  
  return this.get<T>(`rag:${key}`);
}

async setRagResults<T>(query: string, results: T, options?: any): Promise<void> {
  const key = await this.generateCacheKey(
    JSON.stringify({
      query: query.toLowerCase().trim(),
      options
    })
  );
  
  await this.set<T>(`rag:${key}`, results, { ttl: CACHE_TTL.RAG_RESULTS });
}
```

### 2. Web Scraper URL Caching

#### Cache Keys for Web Scraper:

```
app:scrape:{hash_of_normalized_url}
```

#### Implementation:

```typescript
async getScrapedContent(url: string): Promise<string | null> {
  const normalized = normalizeUrl(url);
  const key = await this.generateCacheKey(normalized);
  
  return this.get<string>(`scrape:${key}`);
}

async setScrapedContent(url: string, content: string): Promise<void> {
  const normalized = normalizeUrl(url);
  const key = await this.generateCacheKey(normalized);
  
  await this.set<string>(`scrape:${key}`, content, { ttl: CACHE_TTL.SCRAPER });
}
```

### 3. DeepSearch Caching

#### Cache Keys for DeepSearch:

```
app:deepsearch:{hash_of_query}
```

#### Implementation:

```typescript
async getDeepSearchResults<T>(query: string): Promise<T | null> {
  const key = await this.generateCacheKey(query.toLowerCase().trim());
  
  return this.get<T>(`deepsearch:${key}`);
}

async setDeepSearchResults<T>(query: string, results: T): Promise<void> {
  const key = await this.generateCacheKey(query.toLowerCase().trim());
  
  await this.set<T>(`deepsearch:${key}`, results, { ttl: CACHE_TTL.DEEP_SEARCH });
}
```

## Error Handling and Resilience

The `CacheService` implements comprehensive error handling:

1. **Typed Errors**: Specific error types for different failure modes.
2. **Graceful Degradation**: Falls back to direct operations when cache fails.
3. **Automatic Retry**: Implements retry logic for transient failures.
4. **Circuit Breaker**: Temporarily disables cache operations after multiple failures.
5. **In-Memory Fallback**: Provides in-memory caching when Redis is unavailable.

### Error Handling Implementation

```typescript
async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
  const fullKey = this.generateFullKey(key, options?.namespace);
  
  try {
    const result = await this.client.get(fullKey);
    
    // Record metrics
    this.recordMetric(result ? 'hit' : 'miss');
    
    // Log at appropriate level
    this.logger.debug('Cache get operation', {
      operation: 'cache_get',
      key: fullKey,
      hit: !!result,
      namespace: options?.namespace
    });
    
    return result as T;
  } catch (error) {
    // Log error
    this.logger.error('Cache get error', {
      operation: 'cache_get_error',
      key: fullKey,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Record error metric
    this.recordMetric('error');
    
    // Increment failure count for circuit breaker
    this.failures++;
    
    // Check circuit breaker
    if (this.failures > this.failureThreshold) {
      this.disableCache(30000); // Disable for 30s
    }
    
    // Bubble up typed error
    throw new CacheError(
      `Failed to get from cache: ${error instanceof Error ? error.message : String(error)}`,
      'get',
      fullKey,
      error instanceof Error ? error : undefined
    );
  }
}
```

## Monitoring and Metrics

The `CacheService` provides detailed metrics to monitor performance:

### Key Metrics

1. **Hit Rate**: Percentage of cache hits vs. total operations.
2. **Error Rate**: Percentage of operations that result in errors.
3. **Average Latency**: Average time for cache operations.
4. **Cache Size**: Approximation of cache size by key count and TTL.
5. **Key Distribution**: Distribution of keys by namespace and TTL.

### Logging Implementation

```typescript
private recordMetric(type: 'hit' | 'miss' | 'error'): void {
  this.metrics[type]++;
  
  const totalOps = this.metrics.hit + this.metrics.miss;
  const hitRate = totalOps > 0 ? this.metrics.hit / totalOps : 0;
  const errorRate = totalOps > 0 ? this.metrics.error / totalOps : 0;
  
  // Log metrics periodically
  if (totalOps % 100 === 0 || Date.now() - this.lastMetricsLog > 60000) {
    this.logger.info('Cache metrics', {
      operation: 'cache_metrics',
      namespace: this.namespace,
      hits: this.metrics.hit,
      misses: this.metrics.miss,
      errors: this.metrics.error,
      hitRate: Math.round(hitRate * 100),
      errorRate: Math.round(errorRate * 100),
      averageLatency: this.metrics.totalLatency / totalOps
    });
    
    // Reset for next period
    this.lastMetricsLog = Date.now();
  }
}
```

## Best Practices

When working with the Redis caching system:

1. **Use the Factory Function**: Always get cache instances via `getCacheService()`.
2. **Implement Domain-Specific Methods**: Extend `CacheService` for domain-specific needs.
3. **Use Appropriate Namespaces**: Keep namespaces consistent for related data.
4. **Handle Cache Errors**: Always catch and handle `CacheError` types.
5. **Consider TTL Carefully**: Choose appropriate TTL values based on data volatility.
6. **Use Consistent Key Generation**: Follow standardized key generation patterns.
7. **Test Cache Behavior**: Include cache scenarios in your tests.
8. **Monitor Cache Performance**: Set up alerts for cache issues.

### Example: Proper Error Handling

```typescript
try {
  const cachedResult = await cacheService.getRagResults(query, options);
  if (cachedResult) {
    return cachedResult;
  }
  
  // Perform actual operation
  const result = await performOperation();
  
  // Cache for future use
  await cacheService.setRagResults(query, result, options);
  
  return result;
} catch (error) {
  // Only log cache errors, don't fail the operation
  if (error instanceof CacheError) {
    logger.warn('Cache operation failed, continuing without cache', {
      operation: error.operation,
      key: error.key,
      error: error.message
    });
  }
  
  // Fall back to direct operation
  return performOperation();
}
```

## Implementation Timeline

1. **Phase 1 (Week 1-2)**: Create the unified cache service and test suite
2. **Phase 2 (Week 3)**: Update vector search and tool implementations
3. **Phase 3 (Week 4)**: Migrate chat engine components and update documentation
4. **Phase 4 (Ongoing)**: Monitor, optimize, and refine based on production performance

## Conclusion

This standardization plan provides a comprehensive approach to unifying Redis caching across our application. The implementation will be phased to ensure minimal disruption while providing immediate benefits in code maintainability, performance, and reliability.

By following these guidelines, we ensure consistent caching behavior, improved error handling, and better observability across all components of the system. 