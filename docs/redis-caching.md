# Redis Caching System

Our application uses [Upstash Redis](https://upstash.com/) for its serverless-friendly architecture and simple integration with Next.js applications. This document outlines our Redis caching design, current implementation, and standardization plan.

## Current Architecture Analysis

The current architecture uses Redis in several different ways:

1. **Direct Redis Client (`redisCache`)**: Used in `document-retrieval.ts` for caching RAG results.
2. **ChatEngineCache Service**: Built on top of `redisCache`, used in `puppeteer.service.ts` for web scraper content caching.
3. **Debug Endpoints**: Endpoints for inspecting cache values in `app/api/debug/cache/route.ts`.
4. **Missing Caching Opportunities**: Services like `perplexity.service.ts` and `deep-search.ts` could benefit from caching.

Key issues with the current implementation:
- Multiple interfaces to Redis (`redisCache` directly and `chatEngineCache`)
- Inconsistent key generation and TTL management
- Duplicate cache logic across files
- No standardized approach to serialization/deserialization

## MVP Plan: Single CacheService

We will create a single `CacheService` to consolidate caching logic:

1. **Eliminate direct `redisCache` usage** across the codebase
2. **Single responsibility** for all caching operations
3. **Consistent key/TTL management**
4. **Standardized error handling** and logging

### Files to Create/Modify

**New Files:**
- `/lib/cache/cache-service.ts`: The `CacheService` class
- `/lib/cache/constants.ts`: TTL values and key prefixes

**Modifications:**
- `document-retrieval.ts`: Replace direct Redis usage with `cacheService`
- `puppeteer.service.ts`: Migrate from `chatEngineCache` to `cacheService`
- `route.ts`: Update debug endpoints to use `cacheService`
- Optional: Add caching to `perplexity.service.ts`

## Implementation Plan

### Phase 1: Core Service Implementation
- Create `CacheService` with get/set/delete methods
- Implement key transformation strategy
- Define TTLs and prefixes in constants

### Phase 2: Migration
- Update existing code to use new service
- Remove `redisCache` direct usage

### Phase 3: Basic Testing
- Add tests for `CacheService`
- Verify caching behavior in dev environment

### Phase 4: Documentation & Cleanup
- Update documentation
- Remove deprecated code

## Key Transformation Strategy

To reliably transform complex inputs into consistent cache keys:

1. **Normalization**: Standardize input format (such as query parameters)
2. **Serialization**: Convert to string with `JSON.stringify`
3. **Hashing**: Generate SHA-1 hash and truncate to reasonable length

### Implementation Considerations

#### 1. SHA-1 Hash Truncation

We truncate SHA-1 hashes to 64 bits (16 hex characters) for cache keys. Important considerations:

- **Security Trade-off**: Full SHA-1 hashes are 160 bits (40 hex characters). Truncating to 64 bits significantly reduces collision resistance.
- **Acceptable for Caching**: This is a reasonable trade-off for cache keys, as collision consequences are limited to cache misses rather than security breaches.
- **Collision Probability**: With 64-bit truncation, collision probability becomes significant only after ~5 billion distinct keys.
- **Future Enhancement**: If needed, we can increase to 96 bits (24 hex characters) for better collision resistance with minimal key length impact.

#### 2. Edge Runtime Compatibility

For crypto operations in Edge Functions (Vercel's serverless environment):

- **Use Web Crypto API**: The Node.js `crypto` module is not fully available in Edge Functions. Instead of:
  ```typescript
  import { createHash } from 'crypto';
  const hash = createHash('sha1').update(input).digest('hex');
  ```
  
  Use the Web Crypto API:
  ```typescript
  async function sha1Hash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  ```

- **Cross-environment Compatibility**: This approach works in both Node.js and Edge runtimes.

#### 3. JSON Serialization Stability

When using `JSON.stringify` for complex objects:

- **Object Key Order**: Since ES2015, JavaScript engines maintain consistent property order:
  1. Integer keys (sorted numerically)
  2. String keys (in insertion order)
  3. Symbol keys (in insertion order)
  
- **Ensuring Stability**: For options objects that may have properties added in different orders:
  ```typescript
  // To ensure consistent serialization for objects with varying property order
  function stableStringify(obj: Record<string, any>): string {
    if (typeof obj !== 'object' || obj === null) {
      return JSON.stringify(obj);
    }
    
    // Sort keys lexicographically for top-level properties
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    
    for (const key of sortedKeys) {
      result[key] = obj[key];
    }
    
    return JSON.stringify(result);
  }
  ```
  
- **When to Use**: Apply this approach for query options or other objects where property order might vary between calls.

## Conclusion

The MVP plan aims to standardize Redis caching with minimal complexity, providing immediate benefits while establishing a foundation for future enhancements. The key transformation strategy addresses the critical concerns of generating reliable cache keys from complex inputs while ensuring compatibility across runtime environments.