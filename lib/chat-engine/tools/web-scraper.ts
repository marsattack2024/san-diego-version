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
import { puppeteerService } from '../../services/puppeteer.service';

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
        description: 'CRITICAL: Use this tool IMMEDIATELY for ANY URL in the user message (including http://, https://, or just domain.com formats). This tool extracts text content from web pages, allowing you to summarize, analyze, or quote from the web page. This tool MUST be preferred over general search when the user provides a specific URL or asks to summarize a webpage. Example triggers: "summarize this website", "tell me about example.com", "extract info from https://site.com". The tool can process up to 3 URLs at once and will automatically cache results for faster future access.',
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