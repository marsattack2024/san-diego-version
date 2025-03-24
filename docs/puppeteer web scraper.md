# Puppeteer Web Scraper Documentation

## Overview

The web scraper is a robust, cloud-based solution that uses Puppeteer to extract content from web pages, with built-in caching, rate limiting, and error handling. It's designed to work within Edge runtime constraints and handle JavaScript-rendered content.

## Architecture

### Components

1. **Cloud Function**
   - Hosted on Google Cloud Functions
   - Uses Puppeteer for JavaScript-rendered content
   - Endpoint: `SCRAPER_ENDPOINT` environment variable

2. **Local Implementation**
   - Located in `lib/agents/tools/web-scraper-tool.ts`
   - Implements caching, rate limiting, and formatting
   - Integrated with the AI chat system

### Cache System

```typescript
const CACHE_CONFIG = {
  maxSize: 50,           // Store up to 50 URLs
  ttl: 1000 * 60 * 360, // Cache for 6 hours
  warmupInterval: 1000 * 60 * 180 // Warm up every 3 hours
};
```

- Uses LRU (Least Recently Used) cache
- Separate caches for raw and formatted content
- Automatic cache warming for frequently accessed URLs

### Rate Limiting

```typescript
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 1000, // Minimum 1 second between requests
};
```

## Features

1. **Content Extraction**
   - Page title and meta description
   - Main content sections
   - Headers and paragraphs
   - Contact information detection
   - Content truncation for large pages

2. **Error Handling**
   - Timeout handling (25s for scraping, 15s for tool execution)
   - Invalid JSON response handling
   - Rate limit exceeded handling
   - Network error recovery

3. **Content Formatting**
   - Markdown formatting for readability
   - Section organization (title, description, content)
   - Contact information extraction
   - Size limits and truncation

## Usage

### Basic Usage

```typescript
const result = await webScraperTool.execute({ 
  url: 'https://example.com' 
});
```

### Response Format

```typescript
interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
  stats?: ScraperStats;
}

interface ScraperStats {
  headers: number;
  paragraphs: number;
  lists: number;
  other: number;
  characterCount?: number;
  wordCount?: number;
}
```

### URL Detection

```typescript
const result = await detectAndScrapeUrlsTool.execute({
  text: 'Check out https://example.com'
});
```

## Integration with AI Chat

1. **Tool Registration**
   - Registered as `comprehensiveScraper` in chat tools
   - Available for AI function calling
   - Integrated with tool manager for result tracking

2. **Content Processing**
   - Maximum content size: 80,000 characters
   - Automatic truncation of large content
   - Markdown formatting for AI consumption

3. **Performance Monitoring**
   - Execution time tracking
   - Cache hit/miss statistics
   - Error rate monitoring

## Error Handling

1. **Timeouts**
   - Scraper operation: 25 seconds
   - Tool execution: 15 seconds
   - Edge function: 60 seconds

2. **Recovery Strategies**
   - Cache fallback for failed requests
   - Rate limit backoff
   - Error logging with context

## Monitoring

1. **Logging**
   - Operation timing
   - Cache statistics
   - Error tracking
   - Content size monitoring

2. **Statistics**
   ```typescript
   const cacheStats = {
     hits: 0,
     misses: 0,
     warmups: 0,
     lastWarmup: 0
   };
   ```

## Best Practices

1. **URL Processing**
   - Always use `ensureProtocol()` for URLs
   - Process only the first URL in multi-URL texts
   - Validate URL format before scraping

2. **Content Handling**
   - Truncate large content (>80KB)
   - Format content for readability
   - Cache formatted content separately

3. **Error Management**
   - Log all errors with context
   - Provide fallback content
   - Track error patterns

## Configuration

1. **Environment Variables**
   ```env
   SCRAPER_ENDPOINT=URL is in .env
   ```

2. **Cache Configuration**
   - Adjust `CACHE_CONFIG` for different needs
   - Monitor cache hit rates
   - Tune warmup intervals

3. **Rate Limiting**
   - Adjust `minInterval` based on load
   - Monitor rate limit hits
   - Implement backoff strategies

## Testing

1. **Test Scripts**
   - Located in `scripts/tests/scraper.test.ts`
   - Tests single and multiple URL scenarios
   - Validates response format

2. **Manual Testing**
   - Use `test-web-scraper.ts` for direct testing
   - Monitor logs for issues
   - Verify cache behavior
