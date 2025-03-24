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

## Perplexity DeepSearch Caching Improvements

Recent updates have enhanced the caching mechanism for Perplexity DeepSearch results, implementing the same consistent patterns used for web scraper caching and RAG. These improvements ensure that DeepSearch results are properly serialized, validated, and stored in Redis.

### Key Improvements to DeepSearch Caching

1. **Structured Object Storage**: All DeepSearch results are now stored with a consistent structure:

```typescript
const cacheableResult = {
  content: deepSearchContent,
  model: deepSearchResponse.model,
  timestamp: Date.now(),
  query: deepSearchQuery.substring(0, 200) // Store truncated query for reference
};
```

2. **Explicit JSON Serialization**: All data is explicitly serialized before storage:

```typescript
const jsonString = JSON.stringify(cacheableResult);
await redis.set(cacheKey, jsonString, { ex: 60 * 60 }); // 1 hour TTL
```

3. **Robust Type Validation**: When retrieving cached content, we implement strict validation:

```typescript
// Ensure we're working with a string before parsing
const parsedContent = typeof cachedContentStr === 'string' 
  ? JSON.parse(cachedContentStr) 
  : cachedContentStr; // If it's already an object, use it directly

// Validate the parsed content has the required structure
if (parsedContent && 
    typeof parsedContent === 'object' && 
    typeof parsedContent.content === 'string' && 
    typeof parsedContent.model === 'string' && 
    typeof parsedContent.timestamp === 'number') {
  // Use the cached content
}
```

4. **Comprehensive Error Handling**: All cache operations are wrapped in try/catch blocks with detailed logging:

```typescript
try {
  // Cache retrieval or storage operations
} catch (cacheError) {
  edgeLogger.error('Error with DeepSearch Redis cache', {
    operation: 'deep_search_cache_error',
    operationId,
    error: cacheError instanceof Error ? cacheError.message : String(cacheError)
  });
}
```

5. **Cache Key Strategy**: We use a shortened query string to create manageable cache keys:

```typescript
const deepSearchQuery = lastUserMessage.content.trim();
const cacheKey = `deepsearch:${deepSearchQuery.substring(0, 200)}`;
```

### DeepSearch-Specific Considerations

- **Shorter TTL**: DeepSearch results use a 1-hour TTL compared to 6 hours for web scraper content, as search results may change more frequently.
- **Query Truncation**: Since DeepSearch queries can be long, we limit the key length by truncating to 200 characters.
- **Model Validation**: We only cache responses with valid models, excluding error responses and timeouts.
- **Cache Bypassing for Errors**: Results containing errors or timeout messages are not cached.

### Complete DeepSearch Caching Flow

1. **Check Cache**: First attempt to retrieve cached content using the query as a key
2. **Validate Response**: If found, ensure cached content has the required structure
3. **Call API If Needed**: If cache miss or validation fails, call Perplexity API
4. **Process Response**: Extract and format the API response
5. **Cache Valid Results**: Store successful responses with explicit serialization
6. **Register Result**: Add the DeepSearch content to the Tool Manager

These improvements ensure DeepSearch results are cached consistently, improving response times and reducing API calls to Perplexity.

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

## Web Scraper Cache Improvements

Recent updates have improved the reliability of the web scraper's caching mechanism to resolve issues with object serialization and validation. These improvements were applied to both the direct route handler (`app/api/chat/route.ts`) and the middleware implementation (`lib/middleware/url-scraping-middleware.ts`).

### Key Improvements

1. **Consistent Object Structure**: We now ensure a consistent structure for cached scraper results:

```typescript
const cacheableResult = {
  url: result.url,
  title: result.title,
  description: result.description || '',
  content: result.content,
  timestamp: Date.now()
};
```

2. **Explicit JSON Serialization**: All data is explicitly serialized before storage:

```typescript
const jsonString = JSON.stringify(cacheableResult);
await redis.set(cacheKey, jsonString, { ex: CACHE_CONFIG.ttl });
```

3. **Robust Type Validation**: When retrieving cached content, we now apply strict validation:

```typescript
// Ensure we're working with a string before parsing
const parsedContent = typeof cachedContentStr === 'string' 
  ? JSON.parse(cachedContentStr) 
  : cachedContentStr; // If it's already an object, use it directly

// Validate the parsed content has the required fields
if (parsedContent && 
    typeof parsedContent === 'object' && 
    typeof parsedContent.content === 'string' && 
    typeof parsedContent.title === 'string' && 
    typeof parsedContent.url === 'string') {
  // Use the cached content
}
```

4. **Error Handling**: Comprehensive error handling for both storage and retrieval operations:

```typescript
try {
  // Storage or retrieval operations
} catch (error) {
  edgeLogger.error('Error details', {
    url: validUrl,
    error: error instanceof Error ? error.message : String(error),
    // Additional diagnostic information
  });
}
```

5. **Detailed Logging**: Enhanced logging includes metrics on content size, JSON string length, and cache operations:

```typescript
edgeLogger.info('Stored scraped content in Redis cache', { 
  url: validUrl,
  contentLength: result.content.length,
  jsonStringLength: jsonString.length,
  ttl: CACHE_CONFIG.ttl
});
```

### Implementation Notes

- **Cache Keys**: Web scraper cache keys follow the format `scrape:{validUrl}` for direct lookups
- **TTL Setting**: Cached web content expires after 6 hours (21,600 seconds)
- **Validation Strategy**: We validate both the structure and individual field types to prevent "[object Object]" errors
- **Fallback Handling**: If cache retrieval fails, we gracefully fall back to scraping the URL

These improvements ensure greater reliability and consistency in the caching mechanism for scraped web content, applying the same patterns used in the RAG caching system.

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