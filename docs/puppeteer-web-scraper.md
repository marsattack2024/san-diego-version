# Puppeteer Web Scraper Documentation

## Overview

The web scraper is a robust, cloud-based solution that uses Puppeteer to extract content from web pages, with built-in caching, error handling, and timeout protection. URLs are detected in user messages and processed directly in the API route, ensuring reliable content extraction for AI responses.

## Architecture

### Components

1. **Cloud Function**
   - Hosted on Google Cloud Functions
   - Uses Puppeteer for JavaScript-rendered content
   - Endpoint: `SCRAPER_ENDPOINT` environment variable

2. **Direct Route Implementation**
   - Located in `app/api/chat/route.ts`
   - Processes URLs within the API request handler
   - Redis caching implementation with proper JSON serialization
   - Timeout protection and error handling

### Processing Flow

1. **URL Detection**
   - Uses `extractUrls` utility to identify URLs in user messages
   - Validates and sanitizes URLs before processing
   - Limits processing to avoid overwhelming responses

2. **Caching & Content Scraping**
   - Checks Redis cache with proper JSON handling
   - Falls back to Puppeteer scraping when cache misses
   - Implements timeout protection (15s) for scraper calls
   - Stores results in Redis with 6-hour TTL

3. **Prompt Enhancement**
   - Adds scraped content to the system message
   - Uses clear formatting for AI consumption
   - Provides explicit instructions for the AI to use the content

### Redis Cache System

```typescript
// Cache key generation and storage
const cacheKey = `scrape:${validUrl}`;
await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 60 * 6 }); // 6 hours TTL
```

- Uses Upstash Redis for distributed caching
- Proper JSON serialization and error handling
- Automatic expiration with 6-hour TTL

## Features

1. **Content Extraction**
   - Page title and meta description
   - Main content sections
   - Content formatting with Markdown
   - Source attribution

2. **Error Handling**
   - Timeout protection (15s for scraping)
   - Cache parsing error handling
   - Redis operation error handling
   - Graceful degradation on failure

3. **Content Formatting**
   - Markdown formatting for readability
   - Clear section organization
   - Source URL inclusion for attribution

## Integration with Chat System

1. **Direct API Route Integration**
   - URL detection and scraping performed directly in route handler
   - Process runs before sending prompt to the OpenAI model
   - Scraped content incorporated into system prompt

```typescript
// Process detected URLs directly
if (urls.length > 0) {
  // ... import necessary functions ...
  
  try {
    // Process the URL with caching
    const fullUrl = ensureProtocol(urls[0]);
    const validUrl = validateAndSanitizeUrl(fullUrl);
    
    // Check cache first with proper JSON handling
    const cachedContentStr = await redis.get(cacheKey);
    
    // ... cache hit/miss handling ...
    
    // Enhance the system message with scraped content
    aiMessages[0].content += `\n\n${'='.repeat(80)}\n` +
      `## IMPORTANT: SCRAPED WEB CONTENT FROM USER'S URLS\n` +
      // ... formatting instructions ...
      formattedContent;
  } catch (error) {
    // Error handling
  }
}
```

2. **Result Formatting**
   - Enhanced system prompt with scraped content
   - Clear section headers and formatting
   - Explicit instructions for AI to use the content

```
=============================================================================
## IMPORTANT: SCRAPED WEB CONTENT FROM USER'S URLS
The following content has been automatically extracted from URLs in the user's message.
You MUST use this information as your primary source when answering questions about these URLs.
Do not claim you cannot access the content - it is provided below and you must use it.
=============================================================================

# SCRAPED CONTENT FROM URL: https://example.com

## Title: Example Page

## Description:
Example description

## Main Content:
Example content

---
SOURCE: https://example.com
```

## Error Handling

1. **Timeouts**
   - Scraper operation: 15 seconds timeout
   ```typescript
   const scrapingPromise = callPuppeteerScraper(validUrl);
   const timeoutPromise = new Promise<never>((_, reject) => {
     setTimeout(() => reject(new Error('Scraping timed out')), 15000);
   });
   
   result = await Promise.race([scrapingPromise, timeoutPromise]);
   ```
   
2. **Cache Handling**
   - Parse errors with fallback to scraping
   ```typescript
   try {
     const parsedContent = JSON.parse(cachedContentStr as string);
     
     // Validate the parsed content has the required fields
     if (parsedContent && typeof parsedContent === 'object' && 
         parsedContent.content && parsedContent.title && parsedContent.url) {
       result = parsedContent;
       edgeLogger.info('Redis cache hit for URL', {
         url: validUrl,
         cacheHit: true,
         contentLength: result.content.length,
         cacheSource: 'redis'
       });
     } else {
       throw new Error('Missing required fields in cached content');
     }
   } catch (parseError) {
     edgeLogger.error('Error parsing cached content', {
       url: validUrl,
       error: parseError.message,
       cachedContentSample: cachedContentStr.substring(0, 100) + '...'
     });
     // Continue with scraping since parsing failed
   }
   ```

3. **Redis Operation Errors**
   - Graceful error handling for Redis operations
   ```typescript
   try {
     await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 60 * 6 });
   } catch (storageError) {
     edgeLogger.error('Error storing in Redis cache', {
       url: validUrl,
       error: storageError instanceof Error ? storageError.message : String(storageError)
     });
   }
   ```

## Redis Caching Fixes

### JSON Serialization Improvements

Recent fixes address potential JSON serialization issues that could occur when storing and retrieving data from Redis:

1. **Type-aware Serialization**

   The system now properly handles different response formats from the Puppeteer scraper:

   ```typescript
   // Handle potential string responses from the scraper
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

   This prevents double-stringification issues that previously caused `"[object Object]"` errors.

2. **Data Validation**

   Scraped content is now validated before caching and after retrieval:

   ```typescript
   // Validate the result has the required fields
   if (!result.content || !result.title || !result.url) {
     throw new Error('Missing required fields in scraper result');
   }
   ```

   This ensures only valid, complete data is stored in the cache.

3. **Detailed Error Reporting**

   Enhanced error logs provide diagnostic information about cache operations:

   ```typescript
   edgeLogger.error('Error parsing cached content', {
     url: validUrl,
     error: parseError.message,
     cachedContentSample: typeof cachedContentStr === 'string' 
       ? cachedContentStr.substring(0, 100) + '...' 
       : `type: ${typeof cachedContentStr}`
   });
   ```

   These logs help diagnose specific issues with cached content.

### Cache Key Strategy

The system uses a simple and effective cache key strategy:

```typescript
const cacheKey = `scrape:${validUrl}`;
```

This provides:
- Namespace separation with the `scrape:` prefix
- URL-based uniqueness for consistent retrieval
- Compatibility with Redis key limitations

### Cache Diagnostics

The logging system now distinguishes between:

1. **Redis Cache Hits**
   ```
   Redis cache hit for URL (url=example.com, cacheHit=true, contentLength=12345, cacheSource=redis)
   ```

2. **Redis Cache Misses**
   ```
   No Redis cache hit - calling puppeteer scraper (url=example.com)
   ```

3. **Scraper Caching**
   ```
   [PUPPETEER SCRAPER] Cache hit (url=example.com, cacheHit=true, accessCount=1)
   ```

This helps differentiate between Redis caching and the Puppeteer endpoint's internal caching.

### Storage and Retrieval Process

1. **Retrieval**
   - Get string value from Redis
   - Parse JSON with error handling
   - Validate required fields exist
   - Use validated content or fallback to scraping

2. **Storage**
   - Ensure result is a proper object (parse if string)
   - Validate content structure
   - Stringify and store in Redis with TTL
   - Log storage operations with content details

## Performance Optimizations

1. **Caching Strategy**
   - Redis distributed caching for sharing across requests
   - Proper JSON serialization of complex objects
   - First-check caching to avoid unnecessary scraping
   - 6-hour TTL balances freshness and performance

2. **Error Boundaries**
   - Isolated try/catch blocks for specific operations
   - Continued operation despite cache failures
   - Detailed error logging for troubleshooting

3. **Content Processing**
   - Single URL processing to avoid overwhelming responses
   - Structured formatting for AI consumption
   - Clear source attribution

## Monitoring

1. **Comprehensive Logging**
   - Cache hit/miss events
   - Scraping operation timing
   - Error tracking with context
   - Content size monitoring

## Implementation Benefits

1. **Simplified Approach**
   - Direct URL processing in route handler
   - No middleware complexity
   - Reliable and predictable behavior
   - Easier to debug and maintain

2. **Edge Runtime Compatibility**
   - Works within Edge runtime constraints
   - Properly handles JSON serialization
   - Manages memory efficiently
   - Timeout protection for long-running operations

## Debugging Notes

When checking if caching is working correctly, look for these log patterns:

1. **Redis Cache Hit**:
   ```
   Redis cache hit for URL (url=example.com, cacheHit=true...)
   ```

2. **Redis Cache Miss with Scraper Call**:
   ```
   No Redis cache hit - calling puppeteer scraper
   ```
   Followed by:
   ```
   Stored scraped content in Redis cache
   ```

3. **Redis Cache Error with Fallback**:
   ```
   Error parsing cached content
   ```
   Followed by:
   ```
   No Redis cache hit - calling puppeteer scraper
   ```

The scraped content will have the same formatting regardless of whether it came from cache or fresh scraping. 