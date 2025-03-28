import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { truncateContent } from '@/lib/chat/prompt-builder';
import { extractUrls, ensureProtocol } from '@/lib/chat/url-utils';
import { tool } from 'ai';
import { z } from 'zod';

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

// Define the tools object
export const chatTools = {
  /**
   * Knowledge Base Tool - Uses RAG system to retrieve relevant information
   */
  getInformation: {
    execute: async (params: KnowledgeBaseParams, context: ToolContext) => {
      try {
        const { query } = params;
        const { toolCallId } = context;

        // For tracking operation duration
        const startTime = Date.now();

        // Log the operation start
        edgeLogger.info('Knowledge base search started', {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'knowledge_base_search',
          toolCallId,
          queryLength: query.length,
          queryPreview: query.substring(0, 20) + (query.length > 20 ? '...' : '')
        });

        // Generate a specialized RAG prompt
        const ragPrompt = query;

        // Mock implementation for search - in a real app this would call the vector search
        // This is a placeholder until we implement the actual search
        const searchResults: SearchResult[] = [
          {
            id: '1',
            content: 'Sample content from the knowledge base that matches the query.',
            similarity: 0.85
          },
          {
            id: '2',
            content: 'Additional information that might be relevant to the user question.',
            similarity: 0.78
          }
        ];

        // Format the results
        let formattedResult: string;

        if (searchResults.length === 0) {
          formattedResult = "No relevant information found in our knowledge base for this query.";
        } else {
          // Process the results
          const resultCount = searchResults.length;
          const totalRetrieved = searchResults.length;

          // Extract content from the search results
          const formattedContent = searchResults
            .map((doc: SearchResult, index: number) => {
              return `Document ${index + 1} (Similarity Score: ${doc.similarity.toFixed(2)}):\n${doc.content}\n`;
            })
            .join('\n---\n\n');

          // Create the complete formatted response
          formattedResult = `Found ${resultCount} most relevant documents (out of ${totalRetrieved} retrieved):
          
${formattedContent}

Remember to cite this information when answering the user's query.`;
        }

        // Log operation completion
        const durationMs = Date.now() - startTime;
        const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
        const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;

        if (isSlow) {
          edgeLogger.warn('Knowledge base search completed', {
            category: LOG_CATEGORIES.TOOLS,
            operation: 'knowledge_base_search_completed',
            toolCallId,
            durationMs,
            resultLength: formattedResult.length,
            resultCount: searchResults.length || 0,
            slow: true,
            important: isImportant,
            status: 'completed'
          });
        } else {
          edgeLogger.info('Knowledge base search completed', {
            category: LOG_CATEGORIES.TOOLS,
            operation: 'knowledge_base_search_completed',
            toolCallId,
            durationMs,
            resultLength: formattedResult.length,
            resultCount: searchResults.length || 0,
            slow: false,
            important: false,
            status: 'completed'
          });
        }

        // Truncate the result if it's too large, to avoid hitting model limits
        const truncatedResult = truncateContent(formattedResult, 15000, 'Knowledge Base');

        // Return the formatted result
        return truncatedResult;
      } catch (error) {
        // Log any errors
        edgeLogger.error('Knowledge base search failed', {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'knowledge_base_search_error',
          error: formatError(error),
          important: true
        });

        // Rethrow to let the caller handle the error
        throw error;
      }
    }
  },

  /**
   * URL Detection Tool - Extracts and validates URLs from text
   */
  detectAndScrapeUrls: {
    execute: async (params: UrlDetectionParams, context: ToolContext) => {
      try {
        const { text } = params;
        const { toolCallId } = context;

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
  },

  /**
   * Web Scraper Tool - Scrapes content from a URL
   */
  webScraper: {
    execute: async (params: WebScraperParams, context: ToolContext) => {
      try {
        const { url } = params;
        const { toolCallId } = context;
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
          url: params.url,
          error: formatError(error),
          important: true,
          stack: error instanceof Error ? error.stack : undefined
        });

        // Return a formatted error message that the model can understand
        return `Failed to scrape content from ${params.url}. Error: ${formatError(error)}. Please try a different URL or approach.`;
      }
    }
  },

  // For compatibility with existing code
  addResource: tool({
    description: 'Store new information in the knowledge base',
    parameters: z.object({
      content: z.string().describe('The information to store')
    }),
    execute: async ({ content }) => {
      return "Information has been stored in the knowledge base.";
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

    // Handle object results with proper error checking
    if (result && typeof result === 'object') {
      // Extract content properties with fallbacks
      const title = result.title || 'Web Content';
      const url = result.url || 'Not provided';

      // Handle content specifically - this is the most critical part
      let content = '';

      if (typeof result.content === 'string') {
        content = result.content;
      } else if (result.content && typeof result.content === 'object') {
        // Try to convert nested content object to string
        try {
          content = JSON.stringify(result.content);
        } catch (e) {
          content = 'Unable to parse content object';
        }
      } else {
        content = 'No content retrieved';
      }

      // Format the result consistently
      return `
## ${title}
URL: ${url}

${content}
      `.trim();
    }

    // Last resort fallback for unexpected formats
    return `Web content: ${JSON.stringify(result, null, 2)}`;
  } catch (error) {
    // Absolute last fallback to prevent failures
    return `Error formatting web content: ${error instanceof Error ? error.message : String(error)}`;
  }
}
