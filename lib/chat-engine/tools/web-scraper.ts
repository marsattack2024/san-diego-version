/**
 * Web Scraper Tool
 * 
 * This module provides a tool for scraping web content from URLs
 * based on a user query. It is designed to be used with the 
 * Vercel AI SDK's tools framework.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { extractUrls } from '@/lib/chat/url-utils';

// Define tool parameters schema using Zod
const webScraperSchema = z.object({
    query: z.string().describe('The user message or query that may contain URLs to scrape'),
    urls: z.array(z.string()).optional().describe('Optional list of specific URLs to scrape instead of extracting from query')
});

// Type for tool options
export interface WebScraperToolOptions {
    timeout?: number;
    maxUrlsToProcess?: number;
    operationName?: string;
    // Will add more configuration options as needed
}

/**
 * Creates a web scraper tool with the specified options
 * @param options - Configuration options for the web scraper tool
 * @returns A configured web scraper tool ready to be used with AI SDK
 */
export function createWebScraperTool(options: WebScraperToolOptions = {}) {
    const {
        timeout = 10000, // Default timeout of 10 seconds
        maxUrlsToProcess = 3, // Default max URLs to process
        operationName = 'web_scraper'
    } = options;

    return tool({
        description: 'Scrape content from web pages when URLs are provided in a message. Use this when specific web content needs to be analyzed or information from websites is requested.',
        parameters: webScraperSchema,
        execute: async ({ query, urls: specificUrls }, { toolCallId }) => {
            try {
                // Log the start of web scraping
                edgeLogger.info('Web scraper started', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    query
                });

                const startTime = Date.now();

                // Extract URLs from the query or use specified URLs
                const urls = specificUrls || extractUrls(query);

                if (!urls || urls.length === 0) {
                    edgeLogger.info('No URLs found to scrape', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: operationName,
                        toolCallId,
                        query
                    });

                    return {
                        content: "No URLs were found to scrape in the provided message.",
                        urls: []
                    };
                }

                // Limit the number of URLs to process
                const urlsToProcess = urls.slice(0, maxUrlsToProcess);

                // Log URLs being processed
                edgeLogger.info('Processing URLs', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    urlCount: urlsToProcess.length,
                    urls: urlsToProcess
                });

                // TODO: Implement actual web scraping logic
                // This is a placeholder that will be replaced with the actual implementation
                // The actual implementation will:
                // 1. Fetch content from each URL
                // 2. Parse HTML to extract meaningful content
                // 3. Format content for use by the AI
                const scrapedContent = urlsToProcess.map(url => ({
                    url,
                    title: `Page title for ${url}`,
                    content: `Placeholder content for ${url}. This will be replaced with actual scraped content.`
                }));

                // Calculate duration
                const durationMs = Date.now() - startTime;

                // Format the content for the AI
                const formattedContent = scrapedContent
                    .map(item => `## ${item.title}\nURL: ${item.url}\n\n${item.content}`)
                    .join('\n\n---\n\n');

                // Log completion
                edgeLogger.info('Web scraping completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    urlCount: urlsToProcess.length,
                    durationMs,
                    query
                });

                // Return formatted results
                return {
                    content: formattedContent,
                    urlsProcessed: urlsToProcess,
                    meta: {
                        count: urlsToProcess.length,
                        durationMs
                    }
                };
            } catch (error) {
                // Handle any errors during scraping
                const errorMessage = error instanceof Error ? error.message : String(error);

                edgeLogger.error('Web scraping failed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    query,
                    error: errorMessage
                });

                // Return error information
                return {
                    content: `Error scraping web content: ${errorMessage}`,
                    error: errorMessage,
                    urls: []
                };
            }
        }
    });
}

/**
 * Default web scraper tool instance with standard configuration
 * Ready to use in both chat implementations
 */
export const webScraperTool = createWebScraperTool(); 