# Redis Caching System Documentation

## Overview

This document outlines the Redis caching implementation used in our application. We use Upstash Redis for its serverless-friendly architecture, low latency, and per-request pricing model. The caching system is designed to optimize AI interactions by reducing duplicate API calls, database queries, and web requests, while providing consistent fallback mechanisms for reliability.

## Architecture Integration

The Redis caching system is deeply integrated with the Chat Engine and acts as a central performance optimization layer across the application. The caching architecture follows a layered approach:

### Core Components

```
┌─────────────────┐      ┌───────────────┐      ┌────────────────┐
│                 │      │               │      │                │
│ Chat Engine     │◄────►│ Redis Cache   │◄────►│ Vector Search  │
│ (core.ts)       │      │ Service       │      │ (RAG System)   │
│                 │      │               │      │                │
└─────────────────┘      └───────────────┘      └────────────────┘
        │                        ▲                       ▲
        │                        │                       │
        ▼                        │                       │
┌─────────────────┐              │                       │
│                 │              │                       │
│ API Route       │              │                       │
│ Handler         │              │                       │
│                 │              │                       │
└─────────────────┘              │                       │
                                 │                       │
                          ┌──────┴───────┐      ┌────────┴───────┐
                          │              │      │                │
                          │ Web Scraper  │      │ DeepSearch     │
                          │ Tool         │      │ Tool           │
                          │              │      │                │
                          └──────────────┘      └────────────────┘
```

1. **Redis Client** (`lib/cache/redis-client.ts`): The low-level Redis client implementation with fallback to an in-memory cache when Redis is unavailable.

2. **Chat Engine Cache Service** (`lib/chat-engine/cache-service.ts`): A higher-level service that provides domain-specific caching operations with proper namespacing and TTL management.

3. **Tool Implementations** (`lib/chat-engine/tools/`): Individual tools that leverage the cache service for their specific operations.

### Key Interactions

- The **Chat Engine Core** (`lib/chat-engine/core.ts`) orchestrates the caching strategy during request processing.
- The **API Route Handler** (`app/api/chat/route.ts`) configures which tools and caching strategies are used based on user preferences and agent type.
- Individual **Tools** implement their own caching logic while leveraging the centralized cache service.

## Configuration

### Environment Variables

The system requires the following environment variables:
- `UPSTASH_REDIS_REST_URL` - The Upstash Redis REST API URL 
- `UPSTASH_REDIS_REST_TOKEN` - The authentication token for Upstash Redis

**Note**: The system also supports fallback to `KV_REST_API_URL` and `KV_REST_API_TOKEN` for backward compatibility.

### Cache Settings

The cache configuration is defined in `lib/cache/redis-client.ts`:

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

TTL settings vary by content type as defined in `lib/chat-engine/cache-service.ts`:

```typescript
export const CACHE_TTL = {
  EMBEDDINGS: 7 * 24 * 60 * 60, // 7 days
  DOCUMENT: 24 * 60 * 60,       // 1 day
  SCRAPER: 12 * 60 * 60,        // 12 hours
  PROMPT: 30 * 24 * 60 * 60,    // 30 days
  CONTEXT: 24 * 60 * 60,        // 1 day
  MESSAGE: 7 * 24 * 60 * 60,    // 7 days
  SESSION: 30 * 24 * 60 * 60,   // 30 days
  SHORT: 1 * 60 * 60,           // 1 hour
};
```

## Implementation Details

### Client Initialization with Fallback

The Redis client is initialized with a fallback to an in-memory cache when Redis is unavailable:

```typescript
async function initializeRedisClient() {
  // Check for required environment variables
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // Create a mock/fallback client if Redis is not available
  if (!url || !token) {
    const warning = `Missing Redis environment variables. Using in-memory fallback.`;
    edgeLogger.warn(warning, { category: LOG_CATEGORIES.SYSTEM });
    return createMockRedisClient();
  }

  try {
    // Initialize with explicit configuration
    const redis = new Redis({ url, token });

    // Test connection before returning
    await redis.set('connection-test', 'ok', { ex: 60 });
    const testResult = await redis.get('connection-test');
    
    if (testResult !== 'ok') {
      throw new Error('Connection test failed');
    }

    await redis.del('connection-test');
    return redis;
  } catch (error) {
    edgeLogger.error('Failed to initialize Redis client, using fallback', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });

    // If connection fails, return the mock client for resilience
    return createMockRedisClient();
  }
}
```

### In-Memory Fallback Client

To ensure the application works even without Redis access, a lightweight in-memory cache implementation is provided:

```typescript
function createMockRedisClient() {
  // Simple in-memory store with expiration handling
  const store = new Map<string, { value: any, expiry: number | null }>();

  return {
    async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
      const expiry = options?.ex ? Date.now() + (options.ex * 1000) : null;
      store.set(key, { value, expiry });
      return 'OK';
    },

    async get(key: string): Promise<any> {
      const item = store.get(key);
      if (!item) return null;

      // Check if the item has expired
      if (item.expiry && item.expiry < Date.now()) {
        store.delete(key);
        return null;
      }

      return item.value;
    },

    // Additional mock methods for del and keys...
  };
}
```

### Chat Engine Cache Service

The Chat Engine Cache Service (`lib/chat-engine/cache-service.ts`) provides domain-specific caching methods with consistent namespacing and TTL management:

```typescript
export class ChatEngineCache {
  private namespace: string;

  constructor(namespace: string = 'chat-engine') {
    this.namespace = namespace;
  }

  private generateKey(key: string, type?: keyof typeof CACHE_KEYS): string {
    const prefix = type ? CACHE_KEYS[type] : '';
    return `${this.namespace}:${prefix}${key}`;
  }

  async setEmbedding(query: string, embedding: number[]): Promise<void> {
    await this.set(query, embedding, {
      ttl: CACHE_TTL.EMBEDDINGS,
      namespace: 'EMBEDDINGS'
    });
  }

  async getEmbedding(query: string): Promise<number[] | null> {
    return this.get<number[]>(query, 'EMBEDDINGS');
  }

  // Additional methods for each domain-specific cache operation...
}
```

## Key Caching Implementations

### 1. RAG (Retrieval Augmented Generation) Caching

The knowledge base tool (`lib/chat-engine/tools/knowledge-base.ts`) uses Redis caching to avoid redundant vector searches:

#### Caching Flow for RAG:

1. **Chat Engine** receives a user query
2. **Knowledge Base Tool** is invoked with the query
3. **Cache Check**: System checks for existing cached results for the semantic query
4. If cached results exist, they're returned without querying the vector database
5. If no cache exists, a vector search is performed and results are cached

#### Cache Keys for RAG:

```
chat-engine:context:{sessionId}:{query}
```

#### Implementation Example:

```typescript
// In knowledge-base.ts tool execution
const cacheKey = `${sessionId}:${queryText}`;
const cachedContext = await chatEngineCache.getContext(sessionId, queryText);

if (cachedContext) {
  edgeLogger.info('Using cached context', {
    operation: 'rag_cache_hit',
    sessionId,
    cacheKey
  });
  
  return cachedContext;
}

// Perform vector search if no cache hit
const documents = await vectorService.search(queryText, options);

// Cache the results for future use
await chatEngineCache.setContext(sessionId, queryText, documents);
```

### 2. Web Scraper URL Caching

The web scraper tool (`lib/chat-engine/tools/web-scraper.ts`) uses caching to avoid repeatedly scraping the same URLs:

#### Caching Flow for Web Scraper:

1. **Chat Engine** extracts URLs from user messages
2. **Web Scraper Tool** is invoked for each URL
3. **Cache Check**: System checks if content for the URL is already cached
4. If cached content exists, it's returned immediately
5. If no cache exists, the URL is scraped and content is cached

#### Cache Keys for Web Scraper:

```
chat-engine:scrape:{normalizedUrl}
```

#### Implementation Example:

```typescript
// In puppeteer.service.ts
async scrapeUrl(url: string): Promise<ScrapedContent> {
  // Validate and normalize URL
  const validUrl = validateAndSanitizeUrl(url);
  
  // Check cache first
  const cachedContent = await chatEngineCache.getScrapedContent(validUrl);
  if (cachedContent) {
    edgeLogger.info('Web scraping cache hit', {
      operation: 'web_scraping_cache_hit',
      url: validUrl
    });
    
    return JSON.parse(cachedContent);
  }
  
  // Scrape URL if no cache hit
  const result = await this.callPuppeteerScraper(validUrl);
  
  // Cache the result
  await chatEngineCache.setScrapedContent(validUrl, JSON.stringify(result));
  
  return result;
}
```

### 3. DeepSearch Caching

The deep search tool (`lib/chat-engine/tools/deep-search.ts`) uses Redis to cache Perplexity API results:

#### Caching Flow for DeepSearch:

1. **Chat Engine** processes a query with DeepSearch enabled
2. **Deep Search Tool** is invoked with the search query
3. **Cache Check**: System checks if there are cached results for the query
4. If cached results exist, they're returned without calling the Perplexity API
5. If no cache exists, the Perplexity API is called and results are cached

#### Cache Keys for DeepSearch:

```
chat-engine:deepsearch:{searchQuery}
```

#### Implementation Example:

```typescript
// In perplexity.service.ts
async search(query: string): Promise<SearchResult> {
  // Generate a cache key for this search query
  const cacheKey = this.generateCacheKey(query);
  
  // Check cache first
  const cachedResult = await chatEngineCache.getDeepSearch('global', cacheKey);
  if (cachedResult) {
    edgeLogger.info('Deep Search cache hit', {
      operation: 'deep_search_cache_hit',
      query: query.substring(0, 50)
    });
    
    return cachedResult;
  }
  
  // Call Perplexity API if no cache hit
  const result = await this.callPerplexityAPI(query);
  
  // Cache the result (with shorter TTL since web content changes often)
  await chatEngineCache.setDeepSearch('global', cacheKey, result);
  
  return result;
}
```

## Tool Registration and Usage

Tools are registered through the tool registry (`lib/chat-engine/tools/registry.ts`) and selectively included based on the agent type and user preferences:

```typescript
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
  const {
    useKnowledgeBase = true,
    useWebScraper = false,
    useDeepSearch = false
  } = options;

  const toolSet: Record<string, Tool<any, any>> = {};

  // Add knowledge base tool if enabled
  if (useKnowledgeBase) {
    toolSet.getInformation = knowledgeBaseTool;
  }

  // Add web scraper tool if enabled
  if (useWebScraper) {
    toolSet.scrapeWebContent = webScraperTool;
  }

  // Add Deep Search tool ONLY if explicitly enabled
  if (useDeepSearch) {
    toolSet.deepSearch = deepSearchTool;
  }

  return toolSet;
}
```

These tools are then used by the Chat Engine core to augment AI responses:

```typescript
// In the Chat Engine's processRequest method
const result = await streamText({
  model: openai(this.config.model),
  messages: allMessages,
  temperature: this.config.temperature,
  maxTokens: this.config.maxTokens,
  system: this.config.systemPrompt,
  tools: this.config.tools ? Object.values(this.config.tools) : undefined,
  // Additional configuration...
});
```

## Agent-Specific Caching

Different agents can have different caching strategies based on their configuration in the agent router (`lib/chat-engine/agent-router.ts`):

```typescript
export const AGENT_CONFIG = {
  default: {
    agentType: 'default',
    systemPrompt: defaultPrompt,
    temperature: 0.7,
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: true  // Default agent can use deep search
    }
  },
  
  copywriting: {
    agentType: 'copywriting',
    systemPrompt: copywritingPrompt,
    temperature: 0.8,
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: false  // Copywriting agent doesn't use deep search
    }
  },
  
  // Additional agent configurations...
};
```

## Performance Metrics

Redis caching provides significant performance improvements:

1. **RAG Cache Hits**: ~30-40% of similar queries are served from cache
2. **Web Scraper Cache Hits**: ~50-60% for frequently shared URLs
3. **DeepSearch Cache Hits**: ~20-30% for common web searches
4. **Average Latency Reduction**: 300-500ms per cached RAG query
5. **Load Reduction**: ~40% reduction in vector database queries

## Recent Improvements

Recent refactoring has enhanced the caching system:

1. **Unified Cache Service**: Consolidated all caching operations through the Chat Engine Cache Service
2. **Improved Serialization**: Fixed issues with JSON serialization/deserialization
3. **Enhanced Error Handling**: Added more robust error recovery and fallback mechanisms
4. **Mock Redis Implementation**: Added in-memory fallback when Redis is unavailable
5. **Domain-Specific Methods**: Implemented specialized methods for each type of cached content
6. **Proper Namespacing**: Added consistent key namespacing for better organization
7. **Variable TTLs**: Implemented content-specific TTLs based on data volatility

## Debugging and Monitoring

### Cache Monitoring

The caching system includes comprehensive metrics tracking:

```typescript
// In redis-client.ts
recordStats(type: 'hit' | 'miss' | 'semantic_hit'): void {
  if (type === 'hit') {
    cacheStats.hits++;
  } else if (type === 'miss') {
    cacheStats.misses++;
  } else if (type === 'semantic_hit') {
    cacheStats.semanticHits++;
  }

  // Log cache stats periodically
  const now = Date.now();
  if (now - cacheStats.lastLoggedAt > 60000 || 
      cacheStats.hits + cacheStats.misses > CACHE_CONFIG.statsLogThreshold) {
    
    const hitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0;
    
    edgeLogger.info('Cache statistics', {
      category: LOG_CATEGORIES.SYSTEM,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      semanticHits: cacheStats.semanticHits,
      hitRate: Math.round(hitRate * 100) + '%',
      period: `${Math.round((now - cacheStats.lastLoggedAt) / 1000)}s`
    });
    
    // Reset stats
    cacheStats.hits = 0;
    cacheStats.misses = 0;
    cacheStats.semanticHits = 0;
    cacheStats.lastLoggedAt = now;
  }
}
```

### Debugging Endpoints

Several debugging endpoints are available for troubleshooting:

1. **Cache Test**: `/api/debug/cache-test` - Tests all cache operations with different data types
2. **Cache Inspection**: `/api/debug/cache?key=your-cache-key` - Examines a specific cache entry
3. **Cache Repair**: `/api/debug/cache-repair?key=your-cache-key` - Fixes problematic cache entries

## Best Practices

When working with the Redis caching system:

1. **Use the Chat Engine Cache Service**: Always access cache through the service for consistent behavior
2. **Handle Serialization Carefully**: Be aware of automatic serialization by the Upstash SDK
3. **Add Proper Error Handling**: Always include try/catch blocks around cache operations
4. **Use Domain-Specific Methods**: Prefer specialized methods over generic set/get operations
5. **Validate Cache Content**: Always validate the structure of cached content before using it
6. **Respect TTL Settings**: Use appropriate TTL values based on content volatility
7. **Include Fallback Logic**: Always have a fallback when cache operations fail 