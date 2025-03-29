# Puppeteer Web Scraper & Redis Caching Implementation

## Overview

Our web scraper system extracts content from web pages using Puppeteer in a cloud-based function, with Redis caching to optimize performance. The system automatically detects URLs in user messages and enhances AI responses with relevant website content.

## Architecture Components

### 1. Web Scraper Tool

The web scraper is implemented as a Vercel AI SDK tool:

```typescript
export const webScraperTool = tool({
  description: 'Scrape content from a web page when URLs are provided',
  parameters: z.object({
    url: z.string().describe('The URL to scrape content from')
  }),
  execute: async ({ url }) => {
    // Sanitize and validate URL
    const validUrl = validateAndSanitizeUrl(url);
    
    // Check cache first
    const cachedContent = await getScrapedContentFromCache(validUrl);
    if (cachedContent) {
      return cachedContent;
    }
    
    // Call the scraper service if no cache hit
    const result = await puppeteerService.scrapeUrl(validUrl);
    
    // Cache the result for future use
    await cacheScrapedContent(validUrl, result);
    
    return formatScrapedContent(result);
  }
});
```

### 2. Puppeteer Service

```typescript
class PuppeteerService {
  async scrapeUrl(url: string): Promise<ScrapedContent> {
    // Determine API endpoint based on environment
    const endpoint = process.env.SCRAPER_ENDPOINT || 
      'https://cloud-function-scraper.googleapis.com/scrape';
    
    // Call the Puppeteer scraper with timeout protection
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000) // 15-second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Scraping failed: ${response.status}`);
    }
    
    const result = await response.json();
    return this.processScrapedContent(result);
  }
  
  private processScrapedContent(data: any): ScrapedContent {
    // Extract and format the relevant content
    return {
      title: data.title || 'Untitled Page',
      description: data.description || '',
      content: data.content || '',
      url: data.url
    };
  }
}
```

### 3. Redis Caching Layer

The Redis caching implementation follows these best practices:

```typescript
// Cache key format
const cacheKey = `scrape:${normalizedUrl}`;

// Store content with TTL (6 hours)
async function cacheScrapedContent(url: string, content: ScrapedContent): Promise<void> {
  try {
    const redis = Redis.fromEnv();
    
    // Ensure we're storing a serializable object
    const cacheableContent = {
      url: content.url,
      title: content.title,
      description: content.description || '',
      content: content.content,
      timestamp: Date.now()
    };
    
    // Proper serialization
    const jsonString = JSON.stringify(cacheableContent);
    
    // Store with 6-hour TTL
    await redis.set(cacheKey, jsonString, { ex: 60 * 60 * 6 });
    
    edgeLogger.info('Stored scraped content in Redis cache', {
      url,
      contentLength: content.content.length,
      jsonStringLength: jsonString.length,
      ttl: 60 * 60 * 6
    });
  } catch (error) {
    // Log error but continue execution
    edgeLogger.error('Failed to cache scraped content', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

## Recent Improvements

### 1. JSON Serialization Fixes

We've implemented robust serialization and parsing to address previous issues:

```typescript
// BEFORE: Problematic serialization approach
await redis.set(cacheKey, result, { ex: 60 * 60 * 6 });

// AFTER: Improved type-safe serialization
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

### 2. Type-Safe Cache Validation

Improved cache validation ensures we only use properly formatted data:

```typescript
// Multi-stage validation approach
if (typeof cachedContentStr === 'string') {
  try {
    const parsedContent = JSON.parse(cachedContentStr);
    
    // Explicit type checking for required fields
    if (parsedContent && 
        typeof parsedContent === 'object' && 
        typeof parsedContent.content === 'string' && 
        typeof parsedContent.title === 'string' && 
        typeof parsedContent.url === 'string') {
      
      return parsedContent;
    } else {
      throw new Error('Invalid cache structure');
    }
  } catch (parseError) {
    edgeLogger.error('Error parsing cached content', {
      error: parseError.message,
      sample: cachedContentStr.substring(0, 100)
    });
  }
}
```

### 3. Error Resilience

Enhanced error handling at multiple levels:

```typescript
// Resilient cache retrieval
async function getScrapedContentFromCache(url: string): Promise<ScrapedContent | null> {
  try {
    const redis = Redis.fromEnv();
    const cacheKey = `scrape:${url}`;
    
    const cachedContent = await redis.get(cacheKey);
    if (!cachedContent) return null;
    
    // Type-safe validation and parsing
    const parsedContent = validateCachedContent(cachedContent);
    
    if (parsedContent) {
      edgeLogger.info('Cache hit for scraped content', {
        url,
        cacheAge: Date.now() - (parsedContent.timestamp || 0)
      });
      return parsedContent;
    }
  } catch (error) {
    // Log but continue to scraping
    edgeLogger.warn('Error retrieving from cache', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  return null;
}
```

### 4. Timeout Management

Implemented proper timeout handling for the scraper:

```typescript
// Function to call the Puppeteer scraper with timeout protection
async function callScraperWithTimeout(url: string): Promise<ScrapedContent> {
  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Scraping timed out')), 15000);
  });
  
  // Create the actual scraping promise
  const scrapingPromise = puppeteerService.scrapeUrl(url);
  
  // Race the promises
  try {
    return await Promise.race([scrapingPromise, timeoutPromise]);
  } catch (error) {
    if (error.message === 'Scraping timed out') {
      edgeLogger.warn('Scraping operation timed out', { url });
    }
    throw error;
  }
}
```

## AI Integration

We integrate scraped content directly into the system prompt for AI models:

```typescript
// Format scraped content for the AI
function formatScrapedContent(content: ScrapedContent): string {
  return `
# SCRAPED CONTENT FROM URL: ${content.url}

## Title: ${content.title}

${content.description ? `## Description:\n${content.description}\n` : ''}

## Main Content:
${content.content}

---
SOURCE: ${content.url}
`.trim();
}

// Add to system prompt
function enhanceSystemPrompt(messages: Message[], content: string): void {
  // Find the system message (usually first message)
  const systemMessage = messages.find(m => m.role === 'system');
  
  if (systemMessage && typeof systemMessage.content === 'string') {
    systemMessage.content += `\n\n${'='.repeat(40)}\n` +
      `## SCRAPED WEB CONTENT FROM USER'S URLS:\n` +
      `The following content has been automatically extracted from URLs in the user's message.\n` +
      `Use this information as your primary source when answering questions about these URLs.\n` +
      `${'='.repeat(40)}\n\n` +
      content +
      `\n\n${'='.repeat(40)}\n`;
  }
}
```

## Implementation in the Chat Engine

In the chat engine, URL detection is integrated with message processing:

```typescript
async function processUrls(messages: Message[]): Promise<void> {
  // Get the last user message
  const lastUserMessage = messages.find(m => m.role === 'user' && m.content);
  if (!lastUserMessage || typeof lastUserMessage.content !== 'string') return;
  
  // Extract URLs from the message
  const urls = extractUrls(lastUserMessage.content);
  if (urls.length === 0) return;
  
  // Process the first URL (limit to avoid overwhelming response)
  const url = urls[0];
  
  try {
    // Attempt to scrape content
    const content = await webScraperService.scrapeUrl(url);
    
    // Format and add to system prompt
    const formattedContent = formatScrapedContent(content);
    enhanceSystemPrompt(messages, formattedContent);
  } catch (error) {
    edgeLogger.error('Failed to process URL', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

## Best Practices

1. **URL Validation**: Always sanitize and validate URLs before processing
2. **Cache First**: Check cache before making external requests
3. **Proper Serialization**: Ensure clean JSON serialization/deserialization
4. **Type Safety**: Implement strict type checking for cached content
5. **Error Handling**: Implement comprehensive error handling at all levels
6. **Timeouts**: Set appropriate timeouts for external services
7. **Fallbacks**: Gracefully handle failures in the scraping process
8. **Logging**: Implement detailed logging for debugging and monitoring

## Future Enhancements

1. **Multi-URL Support**: Process multiple URLs in parallel
2. **Selective Content Extraction**: Extract only the most relevant sections
3. **Summarization**: Add automatic summarization for long pages
4. **Structured Data Extraction**: Add support for extracting structured data
5. **Image Processing**: Add support for describing images in scraped content
6. **Domain-Specific Extractors**: Create specialized extractors for common sites
7. **Cache Prefetching**: Implement proactive cache warming for common URLs
8. **Content Updates**: Add mechanism to detect and refresh stale cached content
