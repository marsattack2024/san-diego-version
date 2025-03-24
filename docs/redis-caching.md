# Redis Caching System Documentation

## Overview

This document outlines the Redis caching implementation used in our application. We use Upstash Redis for its serverless-friendly architecture, low latency, and per-request pricing model. The caching system leverages the official Upstash Redis SDK for automatic JSON serialization/deserialization, with additional safeguards to prevent common caching issues.

## Integration with Vercel AI SDK

Our application uses Vercel AI SDK for AI features and integrates with the Redis caching system to optimize performance and reduce costs. Here's how they work together:

### AI Feature Caching

The Vercel AI SDK generates responses for user queries. To avoid redundant API calls for similar queries, we cache:

1. **RAG (Retrieval Augmented Generation) Results**: Cached semantic search results from our vector database, reducing database load and embedding costs.
2. **DeepSearch Results**: Web search responses from Perplexity, which are expensive and relatively stable.
3. **Web Scrape Content**: Cached website content from URLs that are frequently referenced.

### Cache Structure with AI SDK

```
┌─────────────────┐      ┌───────────────┐      ┌────────────────┐
│                 │      │               │      │                │
│ Vercel AI SDK   │◄────►│ Redis Cache   │◄────►│ Vector Search  │
│ (Chat Handlers) │      │               │      │ (RAG System)   │
│                 │      │               │      │                │
└─────────────────┘      └───────────────┘      └────────────────┘
        │                        ▲                       ▲
        │                        │                       │
        ▼                        │                       │
┌─────────────────┐              │                       │
│                 │              │                       │
│ Chat Interface  │              │                       │
│ (Client)        │              │                       │
│                 │              │                       │
└─────────────────┘              │                       │
                                 │                       │
                          ┌──────┴───────┐      ┌────────┴───────┐
                          │              │      │                │
                          │ Web Scraper  │      │ DeepSearch     │
                          │ (URLs)       │      │ (Perplexity)   │
                          │              │      │                │
                          └──────────────┘      └────────────────┘
```

## Configuration

### Environment Variables

The system requires the following environment variables:
- `UPSTASH_REDIS_REST_URL` - The Upstash Redis REST API URL 
- `UPSTASH_REDIS_REST_TOKEN` - The authentication token for Upstash Redis

**Note**: The system also supports fallback to `KV_REST_API_URL` and `KV_REST_API_TOKEN` for backward compatibility.

### Cache Settings

```typescript
const CACHE_CONFIG = {
  ttl: 12 * 60 * 60,        // 12 hours default
  shortTtl: 1 * 60 * 60,    // 1 hour for LLM responses
  statsLogThreshold: 10,     // Log stats every 10 operations
  maxContentSize: 80000,     // Max content size in bytes
  retryAttempts: 3,         // Number of retry attempts
  retryDelay: 1000          // Delay between retries in ms
};
```

## Implementation Details

### Client Initialization

We initialize the Redis client with proper error handling and environment variable fallbacks:

```typescript
async function initializeRedisClient() {
  // Check for required environment variables
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // Validate environment variables
  if (!url || !token) {
    const missingVars = [];
    if (!url) missingVars.push('KV_REST_API_URL/UPSTASH_REDIS_REST_URL');
    if (!token) missingVars.push('KV_REST_API_TOKEN/UPSTASH_REDIS_REST_TOKEN');
    
    const error = `Missing required environment variables: ${missingVars.join(', ')}`;
    edgeLogger.error(error, {
      category: LOG_CATEGORIES.SYSTEM,
      important: true
    });
    throw new Error(error);
  }

  try {
    // Initialize with explicit configuration
    const redis = new Redis({
      url,
      token
    });

    // Test connection before returning
    await redis.set('connection-test', 'ok', { ex: 60 });
    const testResult = await redis.get('connection-test');
    
    if (testResult !== 'ok') {
      throw new Error('Connection test failed');
    }

    edgeLogger.info('Upstash Redis connected', { 
      category: LOG_CATEGORIES.SYSTEM, 
      important: true,
      url
    });

    await redis.del('connection-test');
    return redis;
  } catch (error) {
    edgeLogger.error('Failed to initialize Redis client', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error),
      important: true,
      url
    });
    throw error;
  }
}

// Initialize Redis client and export promise
export const redisClientPromise = initializeRedisClient();
```

### Cache Key Generation

We use the Web Crypto API for generating consistent cache keys:

```typescript
// Hash function using Web Crypto API
async function hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16);
}
```

### Setting Values

The improved `set` method leverages the Upstash Redis SDK's automatic JSON serialization features:

```typescript
async set(key: string, value: any, ttl?: number): Promise<void> {
  try {
    const redis = await redisClientPromise;
    
    edgeLogger.debug('Cache set value type', { 
      type: typeof value, 
      isNull: value === null,
      isUndefined: value === undefined,
      isString: typeof value === 'string'
    });
    
    // Let the Upstash Redis SDK handle serialization based on its own rules
    // This is the recommended approach from Upstash documentation
    if (ttl) {
      await redis.set(key, value, { ex: ttl });
    } else {
      await redis.set(key, value, { ex: CACHE_CONFIG.ttl });
    }
    
    edgeLogger.debug('Cache set', { 
      category: LOG_CATEGORIES.SYSTEM, 
      key, 
      ttl: ttl || CACHE_CONFIG.ttl 
    });
  } catch (error) {
    edgeLogger.error('Cache set error', { 
      category: LOG_CATEGORIES.SYSTEM, 
      error: error instanceof Error ? error.message : String(error), 
      key 
    });
  }
}
```

### Getting Values

The improved `get` method includes JSON parsing and validation:

```typescript
async get(key: string): Promise<any> {
  try {
    const redis = await redisClientPromise;
    const value = await redis.get(key);
    
    edgeLogger.debug('Cache get', { 
      category: LOG_CATEGORIES.SYSTEM, 
      key, 
      hit: value !== null,
      valueType: typeof value
    });
    
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle string values that might be JSON
    if (typeof value === 'string') {
      try {
        // Attempt to parse as JSON if it's a valid JSON string
        if (isValidJsonString(value)) {
          return JSON.parse(value);
        }
        // If it's not valid JSON, return the string as is
        return value;
      } catch (parseError) {
        edgeLogger.warn('Cache parse error', {
          category: LOG_CATEGORIES.SYSTEM,
          key,
          error: parseError instanceof Error ? parseError.message : String(parseError)
        });
        return value; // Return the raw string if parsing fails
      }
    }
    
    // Return non-string values as is
    return value;
  } catch (error) {
    edgeLogger.error('Cache get error', { 
      category: LOG_CATEGORIES.SYSTEM, 
      error: error instanceof Error ? error.message : String(error), 
      key 
    });
    return null;
  }
}
```

## Specialized Caching Functions for AI

We provide domain-specific caching methods for AI features:

```typescript
// For RAG (Retrieval Augmented Generation) results
async getRAG(tenantId: string, query: string): Promise<any> {
  const key = `${tenantId}:rag:${await hashKey(query)}`;
  return this.get(key);
},

async setRAG(tenantId: string, query: string, result: any): Promise<void> {
  const key = `${tenantId}:rag:${await hashKey(query)}`;
  await this.set(key, result);
},

// For web scrape content
async getScrape(tenantId: string, url: string): Promise<any> {
  const key = `${tenantId}:scrape:${await hashKey(url)}`;
  return this.get(key);
},

async setScrape(tenantId: string, url: string, content: any): Promise<void> {
  const key = `${tenantId}:scrape:${await hashKey(url)}`;
  await this.set(key, content);
},

// For deep search results with shorter TTL
async getDeepSearch(tenantId: string, query: string): Promise<any> {
  const key = `${tenantId}:deepsearch:${await hashKey(query)}`;
  return this.get(key);
},

async setDeepSearch(tenantId: string, query: string, result: any): Promise<void> {
  const key = `${tenantId}:deepsearch:${await hashKey(query)}`;
  await this.set(key, result, CACHE_CONFIG.shortTtl);
}
```

## Perplexity DeepSearch Caching

### Overview

Our application uses Perplexity's API for enhanced web search capabilities (DeepSearch). Since these API calls are expensive, rate-limited, and relatively stable in results over short time periods, we implement dedicated caching for DeepSearch results with specialized configuration.

### DeepSearch Implementation

The DeepSearch feature is implemented as a wrapper around Perplexity's API, which provides advanced web search capabilities:

```typescript
export async function callPerplexityAPI(query: string): Promise<{
  content: string;
  model: string;
  timing: { total: number };
}> {
  // Implementation details in lib/agents/tools/perplexity/api.ts
}
```

This function makes requests to our serverless API route (`/api/perplexity/route.ts`), which in turn calls Perplexity's API with appropriate authentication and parameters.

### Cache Key Strategy

The DeepSearch cache implementation uses a specialized naming convention and hashing strategy:

```typescript
// In lib/cache/redis-client.ts or lib/vector/rag-cache.ts
async getDeepSearch(tenantId: string, query: string): Promise<any> {
  // Generate a consistent hash from the query to handle long queries
  const hash = await hashKey(query);
  
  // Create a structured cache key with tenant isolation and type prefix
  const key = `${tenantId}:deepsearch:${hash}`;
  
  return this.get(key);
}

async setDeepSearch(tenantId: string, query: string, result: any): Promise<void> {
  const hash = await hashKey(query);
  const key = `${tenantId}:deepsearch:${hash}`;
  
  // Use a shorter TTL (1 hour) for DeepSearch results
  // Web search results become stale faster than other content
  await this.set(key, result, CACHE_CONFIG.shortTtl);
}
```

Key characteristics:
- Tenant isolation with a prefix (`tenantId:deepsearch:`)
- Uses the hashed query to generate a consistent, fixed-length key
- Applies a shorter TTL (1 hour) compared to other cached content (12 hours)

### Implementation in Chat Route

The DeepSearch caching is integrated in the chat API route (`app/api/chat/route.ts`) with the following pattern:

```typescript
// Simplified implementation from app/api/chat/route.ts
if (deepSearchEnabled) {
  // Create a meaningful operation ID for tracing
  const operationId = `deepsearch-${Date.now().toString(36)}`;
  const query = lastUserMessage.content;
  
  try {
    // First check cache for existing results
    const redisCache = new RedisCache(); // or imported instance
    const cachedResults = await redisCache.getDeepSearch('global', query);
    
    if (cachedResults) {
      // Cache hit - use the cached results
      toolManager.registerToolResult('Deep Search', cachedResults);
      
      edgeLogger.info('Using cached DeepSearch results', {
        operation: 'deep_search_cache_hit',
        operationId,
        contentLength: typeof cachedResults === 'string' 
          ? cachedResults.length 
          : JSON.stringify(cachedResults).length
      });
      
      // Notify client that DeepSearch is complete
      eventHandler({
        type: 'deepSearch',
        status: 'completed',
        details: `Using cached results (${
          typeof cachedResults === 'string' 
            ? cachedResults.length 
            : JSON.stringify(cachedResults).length
        } characters)`
      });
    } else {
      // Cache miss - call Perplexity API
      edgeLogger.info('No cached DeepSearch results found', {
        operation: 'deep_search_cache_miss',
        operationId
      });
      
      // Call Perplexity API with timeout protection
      const deepSearchResponse = await Promise.race([
        callPerplexityAPI(query),
        // Timeout promise
      ]);
      
      const deepSearchContent = deepSearchResponse.content;
      
      if (deepSearchContent && 
          deepSearchContent.length > 0 && 
          !deepSearchContent.includes("timed out")) {
        
        // Store successful results in cache
        await redisCache.setDeepSearch('global', query, deepSearchContent);
        
        edgeLogger.info('Cached new DeepSearch results', {
          operation: 'deep_search_cache_set',
          operationId,
          contentLength: deepSearchContent.length,
          ttl: CACHE_CONFIG.shortTtl
        });
        
        // Use the results
        toolManager.registerToolResult('Deep Search', deepSearchContent);
      }
    }
  } catch (error) {
    // Error handling...
  }
}
```

### Performance Benefits

The DeepSearch caching system provides several key benefits:

1. **Reduced API Costs**: By reusing previous search results, we minimize the number of calls to the paid Perplexity API.

2. **Faster Response Times**: Cache hits deliver results immediately (typically <50ms) compared to new API calls (3-15 seconds).

3. **Rate Limit Protection**: Caching helps avoid exceeding Perplexity's rate limits during high traffic periods.

4. **Consistent Answers**: Users asking similar questions within the cache window receive consistent information.

### Data Structure

DeepSearch results are stored as plain strings to simplify processing:

```typescript
// Example cached DeepSearch content (abbreviated)
"According to recent market research data for portrait photographers in Miami, the competitive landscape includes several established studios specializing in boudoir photography. Top competitors include Miami Boudoir Studio (specializing in empowering women-focused photography with packages ranging $500-2000), Intimate Photography Miami (known for luxury boudoir sessions starting at $750), and South Beach Boudoir (targeting high-end clients with average bookings of $1500+). Most successful studios emphasize privacy, comfort-focused studios, and specialized lighting techniques..."
```

### Monitoring and Optimization

The system includes comprehensive logging for DeepSearch cache operations:

```typescript
// Logging for cache hit
edgeLogger.info('Using cached DeepSearch results', {
  operation: 'deep_search_cache_hit',
  operationId,
  queryLength: query.length,
  cachedResultLength: cachedContent.length,
  age: Date.now() - (parsedMetadata?.timestamp || Date.now()),
  ttlRemaining: 'estimated based on creation time'
});

// Logging for cache set
edgeLogger.info('Cached new DeepSearch results', {
  operation: 'deep_search_cache_set',
  operationId,
  queryLength: query.length,
  resultLength: deepSearchContent.length,
  ttl: CACHE_CONFIG.shortTtl
});
```

These logs help optimize cache TTL values and diagnose any issues with the DeepSearch functionality.

## Integration with RAG (Retrieval Augmented Generation)

Our RAG system in `lib/vector/documentRetrieval.ts` uses Redis caching to avoid duplicate vector searches. Here's how it works:

```typescript
export async function findSimilarDocumentsOptimized(
  queryText: string,
  options: DocumentSearchOptions = {}
): Promise<{ documents: RetrievedDocument[], metrics: DocumentSearchMetrics }> {
  // Generate a consistent cache key based on the query and options
  const cacheKey = await generateConsistentCacheKey(queryText, options);
  
  try {
    // Try to retrieve from cache first
    const cachedResults = await redisCache.getRAG('global', cacheKey);
    if (cachedResults) {
      try {
        // Handle both string and parsed object responses
        const parsedResults = typeof cachedResults === 'string' 
          ? JSON.parse(cachedResults) 
          : cachedResults;
        
        // Validate the structure matches our interface
        if (parsedResults && 
            typeof parsedResults === 'object' &&
            Array.isArray(parsedResults.documents) && 
            parsedResults.metrics &&
            parsedResults.timestamp) {
          // Cache hit - return the cached results
          logger.info('Cache hit', {
            operation: 'cache_hit',
            queryLength: queryText.length,
            resultCount: parsedResults.documents.length,
            age: Date.now() - parsedResults.timestamp
          });
          
          return {
            documents: parsedResults.documents,
            metrics: parsedResults.metrics
          };
        }
      } catch (error) {
        logger.warn('Cache parse error, falling back to search', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    logger.warn('Cache retrieval error, falling back to search', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  // Cache miss or error - perform vector search
  const documents = await findSimilarDocuments(queryText, options);
  const metrics = calculateSearchMetrics(documents);
  
  // Cache the search results for future queries
  try {
    const cacheableResults = {
      documents,
      metrics,
      timestamp: Date.now()
    };
    
    // Serialize to JSON string before caching
    const serializedResults = JSON.stringify(cacheableResults);
    await redisCache.setRAG('global', cacheKey, serializedResults);
    
    logger.info('Cached search results', {
      operation: 'cache_set',
      queryLength: queryText.length,
      resultCount: documents.length
    });
  } catch (error) {
    logger.error('Failed to cache search results', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  return { documents, metrics };
}
```

## Recent Fixes and Improvements

We recently fixed several critical issues with the Redis cache implementation:

1. **Fixed Serialization Issues**:
   - Eliminated double JSON stringification that caused `"[object Object]" is not valid JSON` errors
   - Improved type handling for different value types (strings, objects, null values)
   - Added helper functions to detect valid JSON strings

2. **Enhanced Error Handling**:
   - Added more granular logging for cache operations
   - Implemented proper error recovery for parsing failures
   - Added validation for cached structure before using results

3. **Debugging Improvements**:
   - Created specialized debugging endpoints for cache inspection and repair
   - Added comprehensive test route with different data types
   - Enhanced logs with type information and value previews

## Testing and Debugging Tools

### 1. Cache Test Route

The `/api/debug/cache-test` endpoint tests the cache implementation with different data types:

```typescript
export async function GET(request: NextRequest) {
  try {
    // Generate a unique key for testing
    const testKey = `test:cache:${Date.now()}`;
    
    // Create a test object with various data types
    const testObject = {
      string: "Test string value",
      number: 12345,
      boolean: true,
      array: [1, 2, 3, "test", { nested: "object" }],
      object: {
        name: "Test object",
        properties: {
          deeply: {
            nested: "value"
          }
        }
      },
      date: new Date().toISOString(),
      nullValue: null
    };
    
    // Test storing and retrieving the object
    await redisCache.set(testKey, testObject);
    const retrievedObject = await redisCache.get(testKey);
    
    // Test JSON string handling
    const jsonString = JSON.stringify({ data: "This is a JSON string" });
    await redisCache.set(`${testKey}:json-string`, jsonString);
    const retrievedJsonString = await redisCache.get(`${testKey}:json-string`);
    
    // Test regular string handling
    const regularString = "This is a regular string";
    await redisCache.set(`${testKey}:regular-string`, regularString);
    const retrievedRegularString = await redisCache.get(`${testKey}:regular-string`);
    
    // Return comprehensive test results
    return NextResponse.json({
      success: true,
      testKey,
      originalObject: testObject,
      retrievedObject,
      objectEquality: JSON.stringify(testObject) === JSON.stringify(retrievedObject),
      jsonStringTest: {
        original: jsonString,
        retrieved: retrievedJsonString,
        retrievedType: typeof retrievedJsonString,
        isEqual: jsonString === retrievedJsonString || 
                (retrievedJsonString && typeof retrievedJsonString === 'object' && 
                JSON.stringify(JSON.parse(jsonString)) === JSON.stringify(retrievedJsonString))
      },
      regularStringTest: {
        original: regularString,
        retrieved: retrievedRegularString,
        retrievedType: typeof retrievedRegularString,
        isEqual: regularString === retrievedRegularString
      },
      cacheParseError: null,
      timeToLive: 1 // 1 second TTL for test keys
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
```

### 2. Cache Inspection Route

The `/api/debug/cache?key=your-cache-key` endpoint allows inspection of a specific cache entry:

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  
  if (!key) {
    return NextResponse.json({ error: 'No cache key provided' }, { status: 400 });
  }
  
  try {
    // Get the raw value from Redis
    const redis = await redisClientPromise;
    const rawValue = await redis.get(key);
    
    // Detailed information about the value
    const rawInfo = {
      valueType: typeof rawValue,
      valueLength: typeof rawValue === 'string' ? rawValue.length : null,
      isString: typeof rawValue === 'string',
      firstChars: typeof rawValue === 'string' ? rawValue.substring(0, 50) : null,
      isNull: rawValue === null,
      rawValue: rawValue
    };
    
    // Attempt to parse the value if it's a string
    let parseAttempt = null;
    let parseError = null;
    
    if (typeof rawValue === 'string') {
      try {
        parseAttempt = JSON.parse(rawValue);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
    }
    
    return NextResponse.json({
      key,
      found: rawValue !== null,
      rawInfo,
      parseAttempt,
      parseError
    });
  } catch (error) {
    return NextResponse.json({
      key,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
```

### 3. Cache Repair Route

The `/api/debug/cache-repair?key=your-cache-key` endpoint can fix problematic cache entries:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  
  try {
    // Step 1: Get the raw value directly from Redis
    const redis = Redis.fromEnv();
    const rawValue = await redis.get(key);
    
    if (!rawValue) {
      return NextResponse.json({
        error: 'Cache key not found',
        key
      }, { status: 404 });
    }
    
    // Step 2: Attempt to fix double-stringified values
    let fixedValue;
    const isDoubleStringified = 
      typeof rawValue === 'string' && 
      rawValue.startsWith('"') && 
      rawValue.endsWith('"') && 
      rawValue.includes('\\');
    
    if (isDoubleStringified) {
      try {
        // Parse the outer JSON string
        const innerJson = JSON.parse(rawValue);
        fixedValue = innerJson;
      } catch (e) {
        return NextResponse.json({
          error: 'Failed to fix double-stringified JSON',
          rawValue,
          parseError: e instanceof Error ? e.message : String(e)
        }, { status: 400 });
      }
    } else {
      // Not double-stringified, so we use it as is
      fixedValue = rawValue;
    }
    
    // Step 3: Store the fixed value back in Redis
    await redis.set(key, fixedValue);
    
    // Step 4: Verify the fix
    const newValue = await redis.get(key);
    
    return NextResponse.json({
      key,
      fixed: isDoubleStringified,
      originalValue: rawValue,
      fixedValue,
      newValue,
      success: true
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 
```

## Key Project Files

The Redis caching implementation spans several files:

| File | Description |
|------|-------------|
| `lib/vector/rag-cache.ts` | Core Redis client implementation with `set`/`get` methods and specialized functions for AI features |
| `lib/vector/documentRetrieval.ts` | RAG implementation that uses Redis for caching vector search results |
| `app/api/debug/cache-test/route.ts` | Test endpoint for verifying the cache implementation with different data types |
| `app/api/debug/cache-repair/route.ts` | Utility for fixing problematic cache entries with serialization issues |
| `app/api/debug/cache/route.ts` | Inspection tool for examining specific cache entries |

## Best Practices

1. **Direct Object Storage**: Pass objects directly to `set` methods and let the Upstash SDK handle serialization.

2. **String vs Object Awareness**: Be careful with string values that might look like JSON strings - the cache implementation now handles these cases properly.

3. **Proper Error Handling**: Always include try/catch blocks when working with cache operations.

4. **Validation Before Use**: Always validate cached structures before using them, as demonstrated in the `findSimilarDocumentsOptimized` function.

5. **Use Domain-Specific Methods**: Prefer the specialized methods (`getRAG`, `setScrape`, etc.) for consistent key generation.

## Support

For issues with the Redis caching implementation, contact the development team.
For Upstash-specific issues, reach out to Upstash support at support@upstash.com or through their [Discord server](https://discord.upstash.com). 