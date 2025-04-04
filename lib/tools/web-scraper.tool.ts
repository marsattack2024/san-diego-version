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
import { extractUrls } from '@/lib/utils/url-utils';
import { puppeteerService } from '@/lib/services/puppeteer.service';

// Simplified schema - just one parameter like DeepSearch uses
// This matches the pattern of the working DeepSearch tool
const webScraperSchema = z.object({
    url: z.string().describe('The URL to scrape or a text containing URLs. The tool will automatically extract and process URLs from the text.')
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
        description: 'Extracts and analyzes content from web pages. Use this tool whenever you encounter a URL in the user message or when asked to summarize a webpage. Simply provide the URL or text containing URLs, and the tool will extract the content for analysis.',
        parameters: webScraperSchema,
        execute: async ({ url }, { toolCallId }) => {
            try {
                // Enhanced debug logging at tool execution start
                edgeLogger.debug('Web scraper tool execute called', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    url: url ? url.substring(0, 200) : 'none'
                });

                // Log the start of web scraping
                edgeLogger.info('Web scraper started', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    url
                });

                const startTime = Date.now();

                // Extract URLs from the text or use directly if it's a valid URL
                const extractedUrls = extractUrls(url);
                const urls = extractedUrls.length > 0 ? extractedUrls : [url];

                if (!urls || urls.length === 0) {
                    edgeLogger.info('No URLs found to scrape', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: operationName,
                        toolCallId,
                        url
                    });

                    return "No valid URLs were found to scrape in the provided text. Please provide a direct URL (e.g., https://example.com) or text containing recognizable URLs.";
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
                            edgeLogger.warn(`Failed to scrape URL: ${url}`, {
                                category: LOG_CATEGORIES.TOOLS,
                                operation: `${operationName}_url_error`,
                                toolCallId,
                                url,
                                error: error instanceof Error ? error.message : String(error)
                            });

                            return {
                                url,
                                title: `Failed to scrape ${url}`,
                                content: `Could not retrieve content: ${error instanceof Error ? error.message : String(error)}`,
                                success: false
                            };
                        }
                    })
                );

                // Calculate duration
                const durationMs = Date.now() - startTime;

                // Format the content for the AI
                const formattedContent = scrapedResults
                    .map(item => {
                        const statusIndicator = item.success ? '✓' : '✗';
                        return `## ${item.title} ${statusIndicator}\nURL: ${item.url}\n\n${item.content}`;
                    })
                    .join('\n\n---\n\n');

                // Log completion
                edgeLogger.info('Web scraping completed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    urlCount: urlsToProcess.length,
                    successCount: scrapedResults.filter(r => r.success).length,
                    failureCount: scrapedResults.filter(r => !r.success).length,
                    durationMs,
                    url
                });

                // Return formatted content directly as a string to simplify the return type
                // This matches the pattern of the working DeepSearch tool which returns a string
                return formattedContent;
            } catch (error) {
                // Handle any errors during scraping
                const errorMessage = error instanceof Error ? error.message : String(error);

                edgeLogger.error('Web scraping failed', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    toolCallId,
                    url,
                    error: errorMessage
                });

                // Return error message as a string
                return `Error scraping web content: ${errorMessage}`;
            }
        }
    });
}

/**
 * Default web scraper tool instance with standard configuration
 * Ready to use in both chat implementations
 */
export const scrapeWebContentTool = createWebScraperTool(); 