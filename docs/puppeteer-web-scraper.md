# Puppeteer Web Scraper & Redis Caching Documentation

## Overview

The web scraper system is a robust, cloud-based solution that extracts content from web pages using Puppeteer, with a multi-layer caching strategy implemented with Upstash Redis. URLs are detected in user messages and processed automatically, ensuring reliable content extraction for AI responses without requiring explicit tool calls.

## Architecture

### Core Components

1. **Cloud Scraper Function**
   - Hosted on Google Cloud Functions
   - Uses Puppeteer for JavaScript-rendered content extraction
   - Endpoint configured via `SCRAPER_ENDPOINT` environment variable
   - Includes internal caching to reduce duplicate requests
   - Handles HTML parsing, content extraction, and sanitization

2. **Direct Route Implementation**
   - Located in `app/api/chat/route.ts`
   - Processes URLs automatically within the API request handler
   - Integrates Redis caching with proper JSON serialization
   - Implements timeout protection (15s) and comprehensive error handling
   - Adds scraped content directly to AI system prompts

3. **Redis Caching Layer**
   - Uses Upstash Redis (Edge-compatible)
   - Provides distributed caching across serverless functions
   - Stores serialized JSON with 6-hour TTL
   - Implements proper error handling and fallbacks

### Detailed Processing Flow

1. **URL Detection & Processing**
   - Uses `extractUrls` utility to identify URLs in user messages
   - Validates and sanitizes URLs before processing
   - Uses `ensureProtocol` to normalize URLs to valid format
   - Limits processing to avoid overwhelming responses (currently 1 URL per message)

2. **Redis Caching Implementation**
   ```typescript
   // Redis instance creation
   const redis = Redis.fromEnv();
   
   // Cache key generation 
   const cacheKey = `scrape:${validUrl}`;
   
   // Retrieval with type checking
   const cachedContentStr = await redis.get(cacheKey);
   if (cachedContentStr) {
     try {
       const parsedContent = JSON.parse(cachedContentStr as string);
       
       // Validate required fields
       if (parsedContent && 
           typeof parsedContent === 'object' && 
           parsedContent.content && 
           parsedContent.title && 
           parsedContent.url) {
         result = parsedContent;
       }
     } catch (parseError) {
       // Error handling with logging
     }
   }
   
   // Storage with TTL
   await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 60 * 6 });
   ```

3. **Scraper Call Implementation**
   ```typescript
   // Function to call the Puppeteer scraper with timeout protection
   const scrapingPromise = callPuppeteerScraper(validUrl);
   const timeoutPromise = new Promise<never>((_, reject) => {
     setTimeout(() => reject(new Error('Scraping timed out')), 15000);
   });
   
   const scraperResult = await Promise.race([scrapingPromise, timeoutPromise]);
   ```

4. **Content Formatting & AI Integration**
   ```typescript
   function formatScrapedContent(content: any): string {
     const { title, description, content: mainContent, url } = content;
     
     return `
   # SCRAPED CONTENT FROM URL: ${url}
   
   ## Title: ${title || 'Untitled Page'}
   
   ${description ? `## Description:\n${description}\n` : ''}
   
   ## Main Content:
   ${mainContent}
   
   ---
   SOURCE: ${url}
   `.trim();
   }
   
   // Enhance the system message with the scraped content
   aiMessages[0].content += `\n\n${'='.repeat(80)}\n` +
     `## IMPORTANT: SCRAPED WEB CONTENT FROM USER'S URLS\n` +
     `The following content has been automatically extracted from URLs in the user's message.\n` +
     `You MUST use this information as your primary source when answering questions about these URLs.\n` +
     `Do not claim you cannot access the content - it is provided below and you must use it.\n` +
     `${'='.repeat(80)}\n\n` +
     formattedContent +
     `\n\n${'='.repeat(80)}\n`;
   ```

## Redis Caching System Details

### Configuration

The Redis caching layer uses Upstash Redis, configured via environment variables:

```typescript
// Environment variables required
// UPSTASH_REDIS_REST_URL - The Redis REST API URL
// UPSTASH_REDIS_REST_TOKEN - Authentication token for Redis

// Redis instance creation
const redis = Redis.fromEnv();
```

### Data Structures

1. **Cache Keys**
   - Format: `scrape:${validUrl}`
   - Prefix `scrape:` for namespace separation
   - Full sanitized URL as unique identifier

2. **Cache Values**
   - JSON serialized objects with structure:
   ```typescript
   interface ScrapedContent {
     url: string;            // Original URL
     title: string;          // Page title
     description?: string;   // Meta description (optional)
     content: string;        // Main content
     timestamp?: string;     // When scraped
   }
   ```

### Cache Operations

1. **Read Operations**
   - Get string value: `await redis.get(cacheKey)`
   - Parse JSON with error handling
   - Validate required fields
   - Fall back to scraping on any error

2. **Write Operations**
   - Format content object
   - Validate all required fields exist
   - Stringify with `JSON.stringify(result)`
   - Store with TTL: `await redis.set(cacheKey, jsonString, { ex: 60 * 60 * 6 })`

3. **Error Handling**
   - Type checking for cached content
   - JSON parse error handling
   - Redis operation error handling
   - Structured logging for diagnostics

4. **Fallback Mechanism**
   - Cache miss → Call scraper
   - Parse error → Call scraper
   - Redis error → Call scraper
   - Scraper error → Return error in logs, continue without content

### Cache Validation

The system implements multi-stage validation:

```typescript
// Stage 1: Type checking
if (typeof cachedContentStr === 'string') {
  // Stage 2: Parse JSON
  try {
    const parsedContent = JSON.parse(cachedContentStr);
    
    // Stage 3: Validate object structure
    if (parsedContent && 
        typeof parsedContent === 'object' && 
        parsedContent.content && 
        parsedContent.title && 
        parsedContent.url) {
      // Valid content, use it
      result = parsedContent;
    } else {
      throw new Error('Missing required fields in cached content');
    }
  } catch (parseError) {
    // Log error and continue to scraping
  }
}
```

### Cache Analytics

The system logs detailed cache operations:

1. **Cache Hits**
   ```
   Redis cache hit for URL (url=example.com, cacheHit=true, contentLength=12345, cacheSource=redis)
   ```

2. **Cache Misses**
   ```
   No Redis cache hit - calling puppeteer scraper (url=example.com)
   ```

3. **Cache Errors**
   ```
   Error parsing cached content (url=example.com, error=Unexpected token in JSON, cachedContentSample=...)
   ```

4. **Cache Storage**
   ```
   Stored scraped content in Redis cache (url=example.com, contentLength=12345, storedAt=2023-07-01T12:34:56.789Z)
   ```

## Puppeteer Scraper Details

### Cloud Function Implementation

The Puppeteer scraper runs as a separate cloud function with these key features:

1. **Browser Management**
   - Creates headless Chrome browser
   - Reuses browser instance when possible
   - Implements connection pooling
   - Provides graceful shutdown

2. **Page Navigation**
   - Sets appropriate user agent
   - Handles timeouts and navigation errors
   - Manages page resources efficiently
   - Enforces maximum page size limits

3. **Content Extraction**
   ```typescript
   // General extraction strategy
   const title = await page.title();
   const description = await page.$eval('meta[name="description"]', 
     el => el.getAttribute('content')).catch(() => '');
   
   // Main content extraction
   const content = await page.evaluate(() => {
     // Complex content extraction logic
     // Prioritizes main content areas
     // Removes navigation, ads, etc.
     // Formats content for readability
   });
   
   return {
     url,
     title,
     description,
     content,
     timestamp: new Date().toISOString()
   };
   ```

4. **Error Handling**
   - Navigation timeouts
   - Content extraction failures
   - Resource limitations
   - Browser crashes

### Content Processing

1. **HTML Cleaning**
   - Removes script tags
   - Eliminates tracking pixels
   - Filters out navigation elements
   - Preserves important content

2. **Content Prioritization**
   - Main article content
   - Headers and subheaders
   - Lists and structured data
   - Important images (described in text)

3. **Format Standardization**
   - Converts to plain text
   - Preserves heading structure
   - Maintains paragraph breaks
   - Retains list formatting

### Security Considerations

1. **URL Validation**
   ```typescript
   function validateAndSanitizeUrl(url: string): string {
     // Parse URL to check components
     try {
       const parsedUrl = new URL(url);
       
       // Only allow http and https protocols
       if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
         throw new Error('Invalid protocol');
       }
       
       // Block private/internal networks
       const hostname = parsedUrl.hostname;
       if (hostname === 'localhost' || 
           hostname.startsWith('127.') || 
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.endsWith('.local')) {
         throw new Error('Private networks not allowed');
       }
       
       // Return sanitized URL
       return parsedUrl.toString();
     } catch (error) {
       throw new Error(`Invalid URL: ${error.message}`);
     }
   }
   ```

2. **Content Sanitization**
   - Removes JavaScript
   - Sanitizes HTML
   - Prevents XSS attacks
   - Limits response size

## Edge Runtime Compatibility

Both the scraper implementation and Redis caching are designed for Edge runtime:

1. **Memory Efficiency**
   - Single URL processing per request
   - Streaming response handling
   - Proper resource cleanup
   - Memory usage monitoring

2. **Timeout Management**
   - Maximum 15-second scraper timeout
   - Graceful timeout handling
   - User-friendly timeout messages
   - Background processing termination

3. **Error Resilience**
   - Isolated try/catch blocks
   - Typed error handling
   - Fallback mechanisms at each stage
   - Clear error diagnostics

## Performance Optimizations

### Redis Caching Strategy

1. **TTL Management**
   - 6-hour cache duration balances freshness and performance
   - High-traffic URLs benefit from caching
   - Automatic cache expiration handles content changes

2. **Minimizing Network Operations**
   - First-check caching reduces scraper calls
   - JSON validation prevents unnecessary scraper fallbacks
   - Proper error handling preserves scraper resources

3. **Content Size Optimization**
   - Limits content size to essential information
   - Focuses on main content areas
   - Omits unnecessary styling and media
   - Balances completeness with prompt size constraints

### Scraper Efficiency

1. **Resource Management**
   - Efficient browser instance reuse
   - Connection pooling
   - Memory usage constraints
   - CPU usage optimization

2. **Selective Content Extraction**
   - Targets high-value content
   - Ignores advertisements
   - Skips navigation elements
   - Prioritizes meaningful text

## Monitoring and Debugging

### Logging Strategy

1. **Structured Logs**
   - Operation type and status
   - URL and content details
   - Timing information
   - Error context and stack traces

2. **Performance Metrics**
   - Cache hit/miss ratio
   - Scraping operation timing
   - Content size statistics
   - Error frequency and types

3. **Diagnostic Patterns**
   - Cache validation failures
   - Scraper timeouts
   - Redis connectivity issues
   - Content extraction problems

### Troubleshooting Common Issues

1. **Empty or Invalid Cache Content**
   - Check Redis connectivity
   - Verify JSON serialization
   - Validate content structure
   - Inspect cache key formation

2. **Scraper Failures**
   - Check scraper endpoint availability
   - Verify URL validation
   - Inspect timeout settings
   - Monitor resource constraints

3. **Content Quality Issues**
   - Review content extraction logic
   - Check HTML structure handling
   - Validate formatting function
   - Inspect specific URL patterns

## Implementation Examples

### Full URL Processing Flow

```typescript
// 1. Extract URLs from user message
const urls = extractUrls(lastUserMessage.content);

// 2. Process the first URL (limiting to avoid overwhelming)
if (urls.length > 0) {
  try {
    // 3. Normalize and validate URL
    const fullUrl = ensureProtocol(urls[0]);
    const validUrl = validateAndSanitizeUrl(fullUrl);
    
    // 4. Check Redis cache
    const cacheKey = `scrape:${validUrl}`;
    const redis = Redis.fromEnv();
    let result;
    
    try {
      const cachedContentStr = await redis.get(cacheKey);
      if (cachedContentStr) {
        // 5a. Process cached content if available
        try {
          const parsedContent = JSON.parse(cachedContentStr as string);
          if (isValidContent(parsedContent)) {
            result = parsedContent;
            logCacheHit(validUrl, result);
          }
        } catch (parseError) {
          logCacheParseError(validUrl, parseError, cachedContentStr);
        }
      }
    } catch (cacheError) {
      logCacheRetrievalError(validUrl, cacheError);
    }
    
    // 6. Fall back to scraper if needed
    if (!result) {
      logCacheMiss(validUrl);
      
      // 7. Call scraper with timeout protection
      result = await callScraperWithTimeout(validUrl);
      
      // 8. Cache the result
      try {
        await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 60 * 6 });
        logCacheStorage(validUrl, result);
      } catch (storageError) {
        logCacheStorageError(validUrl, storageError);
      }
    }
    
    // 9. Format content for AI
    const formattedContent = formatScrapedContent(result);
    
    // 10. Add to system prompt
    enhanceSystemPrompt(aiMessages, formattedContent);
    
  } catch (error) {
    logUrlProcessingError(urls[0], error);
  }
}
```

### Complete Redis Error Handling

```typescript
// Full cache handling with all edge cases
try {
  const cachedContentStr = await redis.get(cacheKey);
  
  // Type checking for cached content
  if (typeof cachedContentStr !== 'string') {
    edgeLogger.warn('Invalid cached content type', {
      url: validUrl,
      type: typeof cachedContentStr,
      valuePreview: String(cachedContentStr).substring(0, 50)
    });
    throw new Error('Invalid cache content type');
  }
  
  // Empty cache check
  if (cachedContentStr.length === 0) {
    edgeLogger.warn('Empty cached content', {
      url: validUrl
    });
    throw new Error('Empty cache content');
  }
  
  // Parse JSON with proper error handling
  try {
    const parsedContent = JSON.parse(cachedContentStr);
    
    // Full validation of all required fields
    if (!parsedContent) {
      throw new Error('Null parsed content');
    }
    
    if (typeof parsedContent !== 'object') {
      throw new Error(`Invalid content type: ${typeof parsedContent}`);
    }
    
    if (!parsedContent.url) {
      throw new Error('Missing URL field');
    }
    
    if (!parsedContent.title) {
      throw new Error('Missing title field');
    }
    
    if (!parsedContent.content) {
      throw new Error('Missing content field');
    }
    
    if (typeof parsedContent.content !== 'string' || parsedContent.content.length === 0) {
      throw new Error('Invalid content field');
    }
    
    // Valid content - use it
    result = parsedContent;
    
    edgeLogger.info('Redis cache hit for URL', {
      url: validUrl,
      cacheHit: true,
      contentLength: result.content.length,
      cacheSource: 'redis',
      title: result.title.substring(0, 50)
    });
  } catch (parseError) {
    edgeLogger.error('Error parsing cached content', {
      url: validUrl,
      error: parseError instanceof Error ? parseError.message : String(parseError),
      cachedContentSample: typeof cachedContentStr === 'string' 
        ? cachedContentStr.substring(0, 100) + '...' 
        : `type: ${typeof cachedContentStr}`
    });
    // Continue with scraping
  }
} catch (cacheError) {
  edgeLogger.error('Error checking Redis cache', {
    url: validUrl,
    error: cacheError instanceof Error ? cacheError.message : String(cacheError)
  });
  // Continue with scraping
}
```

## Redis Caching Fixes

Recent updates have resolved issues with Redis caching for the web scraper, addressing JSON serialization problems and preventing the common "[object Object]" validation errors.

### JSON Serialization Improvements

The most critical fix addresses improper object serialization, which previously could cause cache validation failures:

```typescript
// BEFORE: Potentially problematic - direct storage of result object
await redis.set(cacheKey, result, { ex: 60 * 60 * 6 });
// or
await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 60 * 6 });

// AFTER: Improved approach - consistent object structure and explicit serialization
const cacheableResult = {
  url: result.url,
  title: result.title,
  description: result.description || '',
  content: result.content,
  timestamp: Date.now()
};

const jsonString = JSON.stringify(cacheableResult);
await redis.set(cacheKey, jsonString, { ex: 60 * 60 * 6 });
```

### Type-Aware Serialization

We now handle different response types properly:

```typescript
// Type-aware handling of different response formats
if (typeof scraperResult === 'string') {
  // If it's a JSON string, parse it
  result = JSON.parse(scraperResult);
  edgeLogger.info('Parsed string result from scraper', {
    resultType: 'json-string',
    parsed: true
  });
} else if (scraperResult && typeof scraperResult === 'object') {
  // If it's already an object, use it directly
  result = scraperResult;
  edgeLogger.info('Using object result from scraper', {
    resultType: 'object'
  });
}
```

### Data Validation

Improved validation when retrieving cached content:

```typescript
// Ensure we're working with a string before parsing
const parsedContent = typeof cachedContentStr === 'string' 
  ? JSON.parse(cachedContentStr) 
  : cachedContentStr; // If it's already an object, use it directly

// Validate the parsed content has the required fields with explicit type checking
if (parsedContent && 
    typeof parsedContent === 'object' && 
    typeof parsedContent.content === 'string' && 
    typeof parsedContent.title === 'string' && 
    typeof parsedContent.url === 'string') {
  // Use the valid cached content
} else {
  // Handle invalid cache structure
}
```

### Enhanced Error Reporting

We've added detailed error logging to pinpoint issues:

```typescript
// When parsing fails, include helpful diagnostic information
edgeLogger.error('Error parsing cached content', {
  url: validUrl,
  error: parseError instanceof Error ? parseError.message : String(parseError),
  cachedContentSample: typeof cachedContentStr === 'string' 
    ? cachedContentStr.substring(0, 100) + '...' 
    : `type: ${typeof cachedContentStr}`
});
```

### Cache Key Strategy

A simple cache key format ensures consistent storage and retrieval:

```typescript
const cacheKey = `scrape:${validUrl}`;
```

### Cache Diagnostics

New logging patterns help identify cache hits and misses:

```typescript
// Cache hit logging
edgeLogger.info('Redis cache hit for URL', {
  url: validUrl,
  cacheHit: true,
  contentLength: result.content.length,
  cacheSource: 'redis'
});

// Cache miss logging
edgeLogger.info('No Redis cache hit - calling puppeteer scraper', { 
  url: validUrl 
});
```

### Storage and Retrieval Process

The complete flow for storing and retrieving scraped content:

1. **Check Cache**: First try to retrieve content using the URL as a key
2. **Validate Response**: Ensure cached content has the required structure
3. **Scrape If Needed**: If cache miss or validation fails, perform scraping
4. **Format Result**: Ensure the result has a consistent structure
5. **Store in Cache**: Serialize and store with appropriate TTL
6. **Format Content**: Format the final content for AI consumption

This improved caching system ensures scraped content is properly stored and retrieved, eliminating the "[object Object]" validation errors that previously occurred.

## Future Enhancements

1. **Multi-URL Processing**
   - Process multiple URLs in parallel
   - Aggregate content with proper attribution
   - Implement priority-based URL selection

2. **Content Quality Improvements**
   - Better extraction of structured data
   - Image description generation
   - Table content preservation
   - Code block formatting

3. **Advanced Caching**
   - Content versioning
   - Partial content updates
   - Stale-while-revalidate pattern
   - Per-URL TTL optimization

4. **Performance Enhancements**
   - Worker thread implementation
   - Smart queue management
   - Domain-based rate limiting
   - Preemptive caching for common URLs
