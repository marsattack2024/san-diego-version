# Web Scraper Implementation

This document outlines the web scraper functionality implemented in our application, which provides automated extraction of content from URLs shared by users or detected in conversations.

## Overview

The web scraper enhances our AI assistant by enabling it to dynamically extract and analyze content from websites that users reference. This capability allows the assistant to provide informed responses based on the specific content of websites rather than relying solely on its training data or knowledge base.

## Architecture

The web scraper follows a robust, layered architecture:

1. **Tool Interface Layer**: Implements the Vercel AI SDK Tool interface
2. **Service Layer**: Abstracts Puppeteer-based web scraping functionality
3. **Caching Layer**: Optimizes performance through Redis caching
4. **URL Processing Layer**: Provides URL validation, normalization and extraction
5. **Content Formatting Layer**: Formats extracted content for AI consumption

### Component Diagram

```
┌───────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│                   │     │                     │     │                   │
│  Web Scraper      │────▶│  Puppeteer          │────▶│  External         │
│     Tool          │     │   Service           │     │  Scraper API      │
│                   │     │                     │     │                   │
└───────────────────┘     └─────────────────────┘     └───────────────────┘
         │                          │                         │
         │                          │                         │
         ▼                          ▼                         ▼
┌───────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│                   │     │                     │     │                   │
│  URL Processing   │     │   Cache Service     │     │  Content Formatter│
│                   │     │                     │     │                   │
│                   │     │                     │     │                   │
└───────────────────┘     └─────────────────────┘     └───────────────────┘
```

## Core Implementation

### 1. Web Scraper Tool

The Web Scraper Tool is defined in `lib/tools/web-scraper.tool.ts` using the Vercel AI SDK's tool pattern:

```typescript
export const webScraperTool = createWebScraperTool();

export function createWebScraperTool(options: WebScraperToolOptions = {}) {
    const {
        timeout = 10000, // Default timeout of 10 seconds
        maxUrlsToProcess = 3, // Default max URLs to process
        operationName = 'web_scraper'
    } = options;

    return tool({
        description: 'CRITICAL: Use this tool IMMEDIATELY for ANY URL in the user message (including http://, https://, or just domain.com formats). This tool extracts text content from web pages, allowing you to summarize, analyze, or quote from the web page. This tool MUST be preferred over general search when the user provides a specific URL or asks to summarize a webpage. Example triggers: "summarize this website", "tell me about example.com", "extract info from https://site.com". The tool can process up to 3 URLs at once and will automatically cache results for faster future access.',
        parameters: webScraperSchema,
        execute: async ({ query, urls: specificUrls }, { toolCallId }) => {
            try {
                // Extract URLs from the query or use specified URLs
                const urls = specificUrls || extractUrls(query);

                if (!urls || urls.length === 0) {
                    return {
                        content: "No URLs were found to scrape in the provided message.",
                        urls: []
                    };
                }

                // Limit the number of URLs to process
                const urlsToProcess = urls.slice(0, maxUrlsToProcess);

                // Process each URL using the puppeteerService
                const scrapedResults = await Promise.all(
                    urlsToProcess.map(async (url) => {
                        try {
                            // Use the puppeteerService to scrape the URL
                            const result = await puppeteerService.scrapeUrl(url);
                            return {
                                url,
                                title: result.title || `Content from ${url}`,
                                content: result.content,
                                success: true
                            };
                        } catch (error) {
                            // Handle errors for individual URLs
                            return {
                                url,
                                title: `Failed to scrape ${url}`,
                                content: `Could not retrieve content: ${error instanceof Error ? error.message : String(error)}`,
                                success: false
                            };
                        }
                    })
                );

                // Format the content for the AI
                const formattedContent = scrapedResults
                    .map(item => {
                        const statusIndicator = item.success ? '✓' : '✗';
                        return `## ${item.title} ${statusIndicator}\nURL: ${item.url}\n\n${item.content}`;
                    })
                    .join('\n\n---\n\n');

                // Return formatted results
                return {
                    content: formattedContent,
                    urlsProcessed: urlsToProcess,
                    meta: {
                        count: urlsToProcess.length,
                        durationMs: Date.now() - startTime
                    }
                };
            } catch (error) {
                // Error handling with detailed logging
                // ...
            }
        }
    });
}
```

### 2. Puppeteer Service

The Puppeteer Service (`lib/services/puppeteer.service.ts`) handles web scraping operations:

```typescript
class PuppeteerService {
    /**
     * Scrape content from a URL using Puppeteer
     * @param url URL to scrape
     * @returns Scraped content
     */
    public async scrapeUrl(url: string): Promise<ScrapedContent> {
        try {
            // Validate URL
            const sanitizedUrl = this.validateAndSanitizeUrl(url);
            if (!sanitizedUrl) {
                throw new Error('Invalid URL: ' + url);
            }

            // Check cache first
            const cachedContent = await cacheService.getScrapedContent(sanitizedUrl);
            if (cachedContent) {
                // Handle both string and object responses from cache
                let cachedResult: PuppeteerResponseData;
                try {
                    // If it's a string, parse it; if it's already an object, use it directly
                    cachedResult = typeof cachedContent === 'string' 
                        ? JSON.parse(cachedContent) as PuppeteerResponseData 
                        : cachedContent as PuppeteerResponseData;
                    
                    return {
                        content: this.formatContent(cachedResult),
                        title: cachedResult.title || 'Untitled Page',
                        url: sanitizedUrl,
                        timestamp: Date.now()
                    };
                } catch (error) {
                    // If parsing fails, log it but continue to fetch fresh content
                }
            }

            // Call scraper
            const result = await this.callPuppeteerScraper(sanitizedUrl);

            // Cache result
            await cacheService.setScrapedContent(sanitizedUrl, JSON.stringify(result));

            // Format and return content
            return {
                content: this.formatContent(result),
                title: result.title || 'Untitled Page',
                url: sanitizedUrl,
                timestamp: Date.now()
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Call the Puppeteer scraper to extract content from a URL
     */
    private async callPuppeteerScraper(url: string): Promise<PuppeteerResponseData> {
        // Make request to external Puppeteer service
        const response = await fetch(SCRAPER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 SanDiego/1.0',
                'Accept': 'application/json, text/html'
            },
            body: JSON.stringify({ 
                url,
                format: 'json'
            })
        });

        // Process response
        // ...
    }

    /**
     * Format scraped content for AI consumption
     */
    private formatContent(data: PuppeteerResponseData): string {
        // Format text data into readable sections
        let formattedContent = '';
        
        // Use content or text field depending on what's available
        const textContent = data.content || data.text || '';
        
        if (!textContent) {
            return 'No content was found on this page.';
        }
        
        // Process content to enhance readability
        // Extract and format headings, paragraphs, etc.
        // ...
        
        // Add metadata if available
        if (data.metadata && Object.keys(data.metadata).length > 0) {
            formattedContent += '\n\n### Metadata\n';
            for (const [key, value] of Object.entries(data.metadata)) {
                if (value) {
                    formattedContent += `**${key}**: ${value}\n`;
                }
            }
        }
        
        return formattedContent;
    }
}

// Export singleton instance
export const puppeteerService = new PuppeteerService();
```

### 3. URL Processing

The URL processing utilities (`lib/utils/url-utils.ts`) handle URL validation and extraction:

```typescript
/**
 * Extracts URLs from text with improved detection
 * @param text Text to extract URLs from
 * @returns Array of extracted URLs
 */
export function extractUrls(
    text: string,
    options: {
        shouldEnsureProtocol?: boolean,
        shouldValidate?: boolean,
        shouldLog?: boolean
    } = {}
): string[] {
    const {
        shouldEnsureProtocol = true,
        shouldValidate = false,
        shouldLog = true
    } = options;

    // First try the regex pattern
    const matches = text.match(URL_REGEX) || [];
    const result: string[] = [...matches];

    // Then check for potential domain-like words that might have been missed
    if (matches.length === 0) {
        const words = text.split(/\s+/);
        for (const word of words) {
            // Advanced domain detection
            // ...
        }
    }

    // Process the extracted URLs
    const processedUrls = result
        .map(url => shouldEnsureProtocol ? ensureProtocol(url) : url)
        .filter((url, index, self) => self.indexOf(url) === index) // Remove duplicates
        .filter(url => !shouldValidate || validateAndSanitizeUrl(url, { logErrors: false }) !== null);

    return processedUrls;
}

/**
 * Validates and sanitizes a URL to ensure it's safe and well-formed
 */
export function validateAndSanitizeUrl(
    url: string,
    options: {
        logErrors?: boolean,
        additionalBannedDomains?: string[]
    } = {}
): string | null {
    // Validation and sanitization logic
    // ...
}
```

### 4. Cache Integration

The web scraper uses the Cache Service for performance optimization:

```typescript
// In lib/cache/cache-service.ts
async getScrapedContent(url: string): Promise<string | null> {
  // Normalize URL
  const normalizedUrl = url.toLowerCase().trim();
  const hashedUrl = await this.hashKey(normalizedUrl);
  
  return this.get<string>(this.generateKey(hashedUrl, CACHE_NAMESPACES.SCRAPER));
}

async setScrapedContent(url: string, content: string): Promise<void> {
  // Normalize URL
  const normalizedUrl = url.toLowerCase().trim();
  const hashedUrl = await this.hashKey(normalizedUrl);
  
  return this.set<string>(
    this.generateKey(hashedUrl, CACHE_NAMESPACES.SCRAPER),
    content,
    { ttl: CACHE_TTL.SCRAPER }
  );
}
```

The TTL for scraped content is defined in `lib/cache/constants.ts`:

```typescript
export const CACHE_TTL = {
  // ...
  SCRAPER: 12 * 60 * 60,  // 12 hours for web scraper content
  // ...
};
```

## Tool Registration

The web scraper tool is registered in the tool registry:

```typescript
// In lib/tools/registry.tool.ts
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
  const {
    useKnowledgeBase = true,
    useWebScraper = true,
    useDeepSearch = false
  } = options;
  
  const toolSet: Record<string, Tool<any, any>> = {};
  
  // Add Web Scraper tool if enabled
  if (useWebScraper) {
    toolSet.webScraper = webScraperTool;
  }
  
  // Other tools...
  
  return toolSet;
}
```

## Content Formatting

The web scraper formats content for optimal AI consumption:

1. **Content Cleaning**: Removes excess whitespace, script tags, and irrelevant content
2. **Section Organization**: Preserves document structure with headings and paragraphs
3. **Metadata Extraction**: Extracts and formats metadata like authors, dates, etc.
4. **Length Management**: Truncates content to prevent token limits while preserving key information
5. **Status Indication**: Clearly marks successful vs. failed scraping attempts

Example formatted content:

```
## Example Website Title ✓
URL: https://example.com

### Main Content
This is the main content from the website, formatted to preserve structure and readability. The content is organized into sections based on the original document structure.

#### Section 1
Content from section 1...

#### Section 2
Content from section 2...

### Metadata
**Author**: John Doe
**Published**: 2023-03-15
**Category**: Technology
```

## Error Handling

The web scraper includes comprehensive error handling:

1. **URL Validation**: Rejects invalid or prohibited URLs
2. **Timeout Handling**: Manages timeouts for unresponsive websites
3. **Content Processing Errors**: Handles issues with content extraction or formatting
4. **Per-URL Error Isolation**: Processes multiple URLs independently so errors don't affect other URLs
5. **Cache Fallbacks**: Uses cached content when available, preventing repeated errors
6. **Graceful Degradation**: Returns useful partial results even when some URLs fail

## Configuration Options

The web scraper supports several configuration options:

```typescript
export interface WebScraperToolOptions {
    timeout?: number;          // Maximum time to wait for scraping (ms)
    maxUrlsToProcess?: number; // Maximum number of URLs to process
    operationName?: string;    // Operation name for logging
}
```

## Security Features

The web scraper implements several security measures:

1. **URL Validation**: Verifies and sanitizes URLs before processing
2. **Banned Domain List**: Maintains a list of prohibited domains:
   ```typescript
   export const BANNED_DOMAINS = ['localhost', '127.0.0.1', 'internal', '.local'];
   ```
3. **Content Sanitization**: Removes potentially harmful elements from scraped content
4. **External Process Isolation**: Uses a separate service for actual scraping to isolate browser operations
5. **Response Validation**: Validates and sanitizes responses before processing

## Logging and Monitoring

The implementation includes detailed logging for monitoring and analytics:

```typescript
// Log scraping start
edgeLogger.info('Web scraping started', {
    category: LOG_CATEGORIES.TOOLS,
    operation: operationName,
    toolCallId,
    url: sanitizedUrl
});

// Log cache hits
edgeLogger.info('Web scraping cache hit', {
    category: LOG_CATEGORIES.TOOLS,
    operation: 'web_scraping_cache_hit',
    operationId,
    url: sanitizedUrl
});

// Log completion
edgeLogger.info('Web scraping completed', {
    category: LOG_CATEGORIES.TOOLS,
    operation: operationName,
    toolCallId,
    urlCount: urlsToProcess.length,
    successCount: scrapedResults.filter(r => r.success).length,
    failureCount: scrapedResults.filter(r => !r.success).length,
    durationMs,
    query
});
```

## Usage Patterns

### When to Use the Web Scraper

The AI is instructed to use the web scraper in these scenarios:

1. **Explicit URL Mention**: When the user includes URLs in their message
2. **Website Analysis Requests**: When asked to analyze or summarize a website
3. **Information Extraction**: When asked to extract specific information from a website
4. **Content Comparison**: When asked to compare information across multiple websites
5. **Domain References**: When the user mentions a domain name (e.g., "example.com")

### How the Web Scraper Is Used in Conversations

1. The user sends a message containing URLs or asks about a website
2. The AI detects URLs either explicitly provided or from domain references in the text
3. The web scraper tool processes the URLs (up to the configured limit)
4. The tool returns formatted content from each URL
5. The AI incorporates this information into its response
6. The AI references the specific sources when using information from scraped content

## Benefits

1. **Current Information**: Provides access to the latest content from websites
2. **Specific Content Analysis**: Allows the AI to analyze specific pages the user is interested in
3. **Enhanced Context**: Gives the AI better context for responding to user queries
4. **Performance Optimization**: Caching reduces repeated scraping of the same URLs
5. **Multi-URL Processing**: Can handle multiple URLs in a single request
6. **Intelligent URL Detection**: Can identify domains even without http/https prefixes

## References

- [Puppeteer Documentation](https://pptr.dev/)
- [Vercel AI SDK Tool Documentation](https://sdk.vercel.ai/docs/getting-started/tools)
- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/)
- [Web Scraping Best Practices](https://www.scrapingbee.com/blog/web-scraping-best-practices/) 