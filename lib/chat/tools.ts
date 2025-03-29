import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { truncateContent } from '@/lib/chat/prompt-builder';
import { extractUrls, ensureProtocol } from '@/lib/chat/url-utils';
import { tool } from 'ai';
import { z } from 'zod';
import {
  detectAndScrapeUrlsSchema,
  webScraperSchema
} from './tool-schemas';

// Format error helper (inline implementation to avoid dependency)
function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

// Type definitions for tool interactions
interface ToolContext {
  toolCallId: string;
  messages: any[];
}

interface KnowledgeBaseParams {
  query: string;
}

interface UrlDetectionParams {
  text: string;
}

interface WebScraperParams {
  url: string;
}

// Document type for search results
interface SearchResult {
  id: string;
  content: string;
  similarity: number;
}

// Define thresholds for logging performance metrics
const THRESHOLDS = {
  SLOW_OPERATION: 2000,    // 2 seconds 
  IMPORTANT_THRESHOLD: 5000 // 5 seconds
};

// Define the tools object using the Vercel AI SDK tool pattern
export const chatTools = {
  /**
   * URL Detection Tool - Extracts and validates URLs from text
   */
  detectAndScrapeUrls: tool({
    description: 'Extracts and validates URLs from text, then scrapes the first URL found to retrieve its content',
    parameters: detectAndScrapeUrlsSchema,
    execute: async ({ text }, { toolCallId }) => {
      try {
        const startTime = Date.now();

        // Extract URLs from the text
        const extractedUrls = extractUrls(text);

        // Validate and clean each URL
        const validatedUrls = extractedUrls
          .map(url => {
            try {
              const fullUrl = ensureProtocol(url);
              // Basic URL validation
              new URL(fullUrl); // This will throw if invalid
              return fullUrl;
            } catch (e) {
              edgeLogger.warn('Invalid URL in text', {
                url,
                error: formatError(e)
              });
              return null;
            }
          })
          .filter(Boolean) as string[];

        // Early return if no valid URLs
        if (validatedUrls.length === 0) {
          return {
            urls: [],
            content: "No valid URLs found in the provided text."
          };
        }

        // Import web scraper dynamically
        const { callPuppeteerScraper } = await import('@/lib/agents/tools/web-scraper-tool');

        // Process the first URL only to avoid overwhelming the model
        const primaryUrl = validatedUrls[0];
        let scrapedContent = "";

        try {
          // Attempt to scrape the URL
          const result = await callPuppeteerScraper(primaryUrl);

          // Format the scraped content
          scrapedContent = `
## URL: ${primaryUrl}

${result.content || result}
          `.trim();
        } catch (scrapingError) {
          edgeLogger.error('URL scraping failed', {
            url: primaryUrl,
            error: formatError(scrapingError),
            category: LOG_CATEGORIES.TOOLS,
            operation: 'url_scraping_error',
            important: true
          });

          scrapedContent = `Failed to retrieve content from ${primaryUrl}. Error: ${formatError(scrapingError)}`;
        }

        const duration = Date.now() - startTime;
        edgeLogger.info('URL detection and scraping completed', {
          operation: 'url_detection_complete',
          durationMs: duration,
          urlsFound: validatedUrls.length,
          contentLength: scrapedContent.length,
          toolCallId
        });

        // Return both the URLs and the content
        return {
          urls: validatedUrls,
          content: scrapedContent
        };
      } catch (error) {
        // Log any errors
        edgeLogger.error('URL detection failed', {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'url_detection_error',
          error: formatError(error),
          important: true
        });

        // Rethrow to let the caller handle the error
        throw error;
      }
    }
  }),

  /**
   * Web Scraper Tool - Scrapes content from a URL
   */
  webScraper: tool({
    description: 'Scrapes content from a URL. Use this tool when you need to extract information from a specific webpage.',
    parameters: webScraperSchema,
    execute: async ({ url }, { toolCallId }) => {
      try {
        const startTime = Date.now();

        // Log scraping start
        edgeLogger.info('Web scraping started', {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'web_scraping',
          toolCallId,
          url
        });

        // Import scraper dynamically to avoid increasing the edge bundle size
        const { callPuppeteerScraper } = await import('@/lib/agents/tools/web-scraper-tool');

        // Call the scraper
        const scraperResult = await callPuppeteerScraper(url);

        // Ensure we have a consistent object format regardless of what the scraper returns
        let formattedResult = {
          title: 'Scraped Content',
          content: '',
          url
        };

        if (typeof scraperResult === 'string') {
          formattedResult.content = scraperResult;
        } else if (scraperResult && typeof scraperResult === 'object') {
          formattedResult.title = scraperResult.title || formattedResult.title;
          formattedResult.content = scraperResult.content || '';
          // Only update URL if one was provided in the result
          if (scraperResult.url) {
            formattedResult.url = scraperResult.url;
          }
        }

        // Verify we have content
        if (!formattedResult.content || formattedResult.content.trim() === '') {
          formattedResult.content = `No content was found at ${url}. The page might be empty or require authentication.`;
        }

        // Log scraping completion
        const durationMs = Date.now() - startTime;
        const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
        const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;

        edgeLogger.info('Web scraping completed', {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'web_scraping_completed',
          toolCallId,
          url,
          durationMs,
          contentLength: formattedResult.content.length,
          slow: isSlow,
          important: isImportant,
          status: 'completed'
        });

        // Truncate the content if it's too large
        if (formattedResult.content.length > 20000) {
          const originalLength = formattedResult.content.length;
          formattedResult.content = truncateContent(formattedResult.content, 20000, 'Web Scraper');

          edgeLogger.info('Web scraper content truncated', {
            category: LOG_CATEGORIES.TOOLS,
            operation: 'web_scraping_truncation',
            originalLength,
            truncatedLength: formattedResult.content.length,
            truncationPercentage: Math.floor((formattedResult.content.length / originalLength) * 100)
          });
        }

        // Format the output consistently for the AI model
        return formatScrapedContent(formattedResult);
      } catch (error) {
        // Log any errors
        edgeLogger.error('Web scraping failed', {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'web_scraping_error',
          url,
          error: formatError(error),
          important: true,
          stack: error instanceof Error ? error.stack : undefined
        });

        // Return a formatted error message that the model can understand
        return `Failed to scrape content from ${url}. Error: ${formatError(error)}. Please try a different URL or approach.`;
      }
    }
  })
};

// Helper to format scraped content consistently
export function formatScrapedContent(result: any): string {
  try {
    // Handle string results
    if (typeof result === 'string') {
      return result;
    }

    // Handle object results
    if (result && typeof result === 'object') {
      // If it's a record with content, format it nicely
      if ('content' in result && typeof result.content === 'string') {
        const title = result.title ? `# ${result.title}\n\n` : '';
        const url = result.url ? `URL: ${result.url}\n\n` : '';
        return `${title}${url}${result.content}`.trim();
      }

      // Fall back to JSON stringify if we don't recognize the format
      return JSON.stringify(result, null, 2);
    }

    // Fallback for any other type
    return String(result);
  } catch (error) {
    edgeLogger.error('Error formatting scraped content', {
      category: LOG_CATEGORIES.SYSTEM,
      error: formatError(error)
    });

    // Provide a safe fallback
    return typeof result === 'string'
      ? result
      : 'Error formatting scraped content. Please try another approach.';
  }
}
