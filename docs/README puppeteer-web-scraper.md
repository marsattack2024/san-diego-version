# Puppeteer Web Scraper & Redis Caching Implementation

## Overview

Our web scraper system extracts content from web pages using Puppeteer in a cloud-based function, with Redis caching to optimize performance. The system automatically detects URLs in user messages and enhances AI responses with relevant web content.

## Components

### 1. Web Scraper Tool

The web scraper is implemented as a Vercel AI SDK tool:

- **Location**: `/lib/chat-engine/tools/web-scraper.ts`
- **Features**:
  - URL extraction from messages
  - Configured as an AI SDK tool with compelling, precise description
  - Works with the Puppeteer Service for actual scraping
  - Handles multiple URLs (limited to 3 by default)
  - Formats and sanitizes output for AI consumption
  - Uses Redis caching for performance
  
### 2. URL Detection System

The URL detection system has been enhanced to handle a wide variety of URL formats:

- **Location**: `/lib/utils/url-utils.ts`
- **Features**:
  - Comprehensive regex pattern for URL detection
  - **NEW**: Enhanced naked domain detection (domains without http/https)
  - **IMPROVED**: Support for common TLDs and international domains
  - Filters out false positives (common abbreviations)
  - Automatic protocol addition (adds https:// to naked domains)
  - URL validation and sanitization for security

### 3. Puppeteer Service

The Puppeteer service handles the actual web scraping:

- **Location**: `/lib/services/puppeteer.service.ts`
- **Features**:
  - Abstracts cloud function communication
  - Formats and processes scraped content
  - Integrates with caching layer
  - Handles errors and timeouts
  - **NEW**: Handles HTML content with intelligent parsing
  - **NEW**: Automatically extracts key content from HTML pages

## Architecture Components

### 1. Web Scraper Tool

The web scraper is implemented as a Vercel AI SDK tool:

```typescript
export const webScraperTool = tool({
  description: 'CRITICAL: Use this tool IMMEDIATELY for ANY URL in the user message (including http://, https://, or just domain.com formats). This tool extracts text content from web pages, allowing you to summarize, analyze, or quote from the web page. This tool MUST be preferred over general search when the user provides a specific URL or asks to summarize a webpage.',
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
      body: JSON.stringify({ 
        url,
        format: 'json' // Explicitly request JSON format
      }),
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

### 1. Enhanced HTML Content Processing

We've added smart HTML content handling to improve readability:

```typescript
// Detect if content is HTML and process accordingly
if (data.content.includes('<!DOCTYPE html>') || data.content.includes('<html')) {
  // Extract title
  const titleMatch = data.content.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Page';
  
  // Extract meta description
  const descriptionMatch = data.content.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';
  
  // Extract main content using common content containers
  // Look for article, main, or content divs
  const contentElements = [
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
    /<div[^>]*(?:class|id)="(?:content|main|post)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];
  
  // Clean and format the extracted content
  const cleanedContent = extractedContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
  // Convert HTML to readable text
  const plainText = convertHtmlToText(cleanedContent);
  
  return formatAsMarkdown(title, description, plainText, url);
}
```

### 2. Content Type Handling

Improved handling of different content types:

```typescript
// Check if response is JSON or HTML
const contentType = response.headers.get('content-type') || '';

// Handle different content types
if (contentType.includes('application/json')) {
  jsonData = JSON.parse(responseText);
} else {
  // Create a JSON structure from HTML content
  jsonData = {
    content: responseText,
    title: extractTitle(responseText),
    url: url
  };
}
```

### 3. Response Format Standardization

We now explicitly request JSON format from the Puppeteer service and handle any format it returns:

```typescript
// Request JSON format explicitly
body: JSON.stringify({ 
  url,
  format: 'json' // Explicitly request JSON format
})
```

### 4. Improved Tool Description

The web scraper tool now has a more compelling and explicit description to ensure proper selection:

```typescript
description: 'CRITICAL: Use this tool IMMEDIATELY for ANY URL in the user message (including http://, https://, or just domain.com formats). This tool extracts text content from web pages, allowing you to summarize, analyze, or quote from the web page. This tool MUST be preferred over general search when the user provides a specific URL or asks to summarize a webpage.'
```

### 5. Enhanced System Prompt

Added explicit directives to the system prompt to prioritize using the web scraper for URLs:

```typescript
system: `${systemPrompt}\n\nIMPORTANT INSTRUCTION: When a user message contains a URL (in any format including https://example.com or just example.com), you MUST use the scrapeWebContent tool to retrieve and analyze the content before responding. Never attempt to guess the content of a URL without scraping it first.`
```

### 6. Comprehensive Test Suite

We've created a thorough test suite for the web scraper functionality:

- **Location**: `/tests/unit/chat-engine/web-scraper.test.ts`
- **Coverage**:
  - URL extraction and detection
  - Multiple URL handling
  - Error handling and resilience
  - Response formatting and processing
  - Proper logging
  - Edge cases and failure modes

Example test for URL extraction:

```typescript
it('should extract URLs from the query', async () => {
  // Execute the tool
  await webScraperTool.execute({ query: sampleQuery }, { 
    toolCallId: sampleToolCallId,
    messages: [{ role: 'user', content: sampleQuery }]
  });
  
  // Verify URL extraction was called
  expect(extractUrls).toHaveBeenCalledWith(sampleQuery);
});
```

## Error Resilience

We've implemented multi-layered error handling for maximum resilience:

### 1. Content Format Error Handling

The service now gracefully handles both JSON and non-JSON responses:

```typescript
try {
  // Check if response is already JSON
  if (contentType.includes('application/json')) {
    jsonData = JSON.parse(responseText);
  } else {
    // Create structured data from non-JSON content
    jsonData = createStructuredData(responseText, url);
  }
} catch (error) {
  edgeLogger.error('Failed to parse response', {
    category: LOG_CATEGORIES.TOOLS,
    operation: 'parse_error',
    contentType,
    errorMessage: error.message
  });
  
  // Fallback to simple structure with error message
  jsonData = {
    content: `Failed to parse content from ${url}: ${error.message}`,
    title: `Error scraping ${url}`,
    url: url
  };
}
```

### 2. HTTP Error Handling

Improved handling of HTTP errors from the Puppeteer service:

```typescript
if (!response.ok) {
  const statusText = response.statusText || 'Unknown error';
  throw new Error(`Scraping failed with status ${response.status}: ${statusText}`);
}
```

### 3. Individual URL Failure Handling

The system continues processing other URLs even if one fails:

```typescript
// Process each URL with individual error handling
const scrapedResults = await Promise.all(
  urlsToProcess.map(async (url) => {
    try {
      return await puppeteerService.scrapeUrl(url);
    } catch (error) {
      // Log error but continue with other URLs
      edgeLogger.warn(`Failed to scrape URL: ${url}`, {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'url_scrape_error',
        url,
        error: error.message
      });
      
      // Return error information
      return {
        url,
        title: `Failed to scrape ${url}`,
        content: `Could not retrieve content: ${error.message}`,
        success: false
      };
    }
  })
);
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
9. **Content Formatting**: Format content for readability and usefulness to the AI
10. **AI Guidance**: Provide clear instructions in the tool description and system prompt

## Future Enhancements

1. **Multi-URL Support**: Process multiple URLs in parallel
2. **Selective Content Extraction**: Extract only the most relevant sections
3. **Summarization**: Add automatic summarization for long pages
4. **Structured Data Extraction**: Add support for extracting structured data
5. **Image Processing**: Add support for describing images in scraped content
6. **Domain-Specific Extractors**: Create specialized extractors for common sites
7. **Cache Prefetching**: Implement proactive cache warming for common URLs
8. **Content Updates**: Add mechanism to detect and refresh stale cached content
