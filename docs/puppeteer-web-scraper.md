# Puppeteer Web Scraper Documentation

## Overview

The web scraper is a robust, cloud-based solution that uses Puppeteer to extract content from web pages, with built-in caching, rate limiting, and error handling. It's integrated into the chat system via middleware to automatically scrape URLs detected in user messages.

## Architecture

### Components

1. **Cloud Function**
   - Hosted on Google Cloud Functions
   - Uses Puppeteer for JavaScript-rendered content
   - Endpoint: `SCRAPER_ENDPOINT` environment variable

2. **Middleware Implementation**
   - Located in `lib/middleware/url-scraping-middleware.ts`
   - Automatically processes URLs in user messages
   - Implements Redis caching, error handling, and content formatting

### Middleware Flow

1. **URL Detection**
   - Automatically extracts URLs from user messages
   - Supports multiple parameter formats (direct message array, tokenized prompts)
   - Special marker system for reliable URL detection

2. **Content Scraping**
   - Validates and sanitizes URLs before scraping
   - Redis cache check to avoid redundant scraping
   - Calls cloud function for actual content extraction
   - Content formatting for AI consumption

3. **Prompt Enhancement**
   - Adds scraped content to system message
   - Preserves original content structure
   - Formats content with clear headers and attribution

### Cache System

```typescript
const CACHE_CONFIG = {
  ttl: 60 * 60 * 6, // 6 hours TTL for scraped content
  maxUrls: 3, // Maximum number of URLs to scrape in one request
  timeout: 15000, // 15 seconds timeout for scraping
};
```

- Uses Redis for distributed caching
- JSON serialization for complex objects
- Automatic expiration with TTL

## Features

1. **Content Extraction**
   - Page title and meta description
   - Main content sections
   - Content formatting with Markdown
   - Source attribution

2. **Error Handling**
   - Timeout handling (15s for scraping)
   - Invalid JSON response handling
   - Graceful degradation

3. **Content Formatting**
   - Markdown formatting for readability
   - Clear section organization
   - Source URL inclusion for attribution

## Integration with Chat System

1. **Middleware Registration**
   - Integrated with Vercel AI SDK via `wrapLanguageModel`
   - Proper middleware ordering (URL scraping before caching)
   - Special URL marker system for reliable detection

```typescript
const wrappedModel = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: [
    // First, process URLs and enhance the prompt
    urlScrapingMiddleware,
    // Then, cache the result based on the enhanced prompt
    cacheMiddleware
  ]
});
```

2. **URL Marker System**
   - Adds special markers to system messages with URLs
   - Ensures reliable URL detection across different prompt formats
   - Works with tokenized and text-based prompts

```typescript
// Add special marker to system message
aiMessages[0].content += `\n\n<!-- URL_SCRAPING_MIDDLEWARE_MARKER: ${JSON.stringify({
  urls: urls.slice(0, 3),
  userMessage: lastUserMessage.content
})} -->\n\n`;
```

3. **Result Formatting**
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
   - Scraper operation: 15 seconds
   - Redis operation timeouts
   - Graceful degradation on failure

2. **Recovery Strategies**
   - Cache fallback for failed requests
   - Error logging with full context
   - Formatted error presentation

## Advanced Features

1. **Parameter Handling**
   - Support for different AI SDK parameter formats
   - Handles tokenized prompts (array-like objects)
   - Works with both message arrays and string prompts

2. **Type Safety**
   - Robust TypeScript implementation
   - Safe transformations with proper type assertions
   - Error boundary protection

3. **Performance Optimizations**
   - Parallel processing for multiple URLs
   - Redis caching to reduce redundant scraping
   - Content size and count limitations

## Monitoring

1. **Comprehensive Logging**
   - Operation timing
   - Cache statistics
   - Detailed error tracking
   - Parameter processing diagnostics

2. **Debugging Tools**
   - Special logging for format detection
   - Parameter type analysis
   - Enhanced error reporting

## Implementation Notes

1. **Middleware vs. Tool Approach**
   - Previously implemented as an explicit AI tool
   - Now integrated directly into request pipeline
   - More reliable and automatic operation
   - No need for explicit AI tool invocation

2. **Edge Runtime Compatibility**
   - Works within Edge runtime constraints
   - Avoids Node.js-specific features
   - Properly manages memory limits 