/**
 * Puppeteer Web Scraping Service
 * 
 * This service provides an interface for extracting content from web pages
 * using a Puppeteer-based scraper. It's designed to be used by the Web Scraper
 * tool in the chat engine.
 */

import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES } from '../logger/constants';
import { cacheService } from '../cache/cache-service';
import { validateAndSanitizeUrl } from '@/lib/utils/url-utils';

// Constants
const SCRAPER_ENDPOINT = process.env.SCRAPER_ENDPOINT || 'https://us-central1-puppeteer-n8n.cloudfunctions.net/puppeteerFunction';

// Types
export interface ScrapedContent {
    content: string;
    title?: string;
    url: string;
    timestamp: number;
}

export interface PuppeteerResponseData {
    content?: string;
    html?: string;
    title?: string;
    text?: string;
    url?: string;
    links?: string[];
    metadata?: Record<string, string>;
    error?: string;
}

export interface ScraperStats {
    characterCount: number;
    wordCount: number;
    paragraphCount: number;
    linkCount: number;
    headingCount: number;
}

/**
 * Puppeteer Scraper Service class
 * Handles web scraping operations and caching
 */
class PuppeteerService {
    constructor() {
        edgeLogger.info('Puppeteer service initialized', {
            category: LOG_CATEGORIES.TOOLS,
            operation: 'puppeteer_service_init'
        });
    }

    /**
     * Validate and sanitize a URL before scraping
     * @param url URL to validate
     * @returns Sanitized URL or null if invalid
     */
    public validateAndSanitizeUrl(url: string): string | null {
        // Use the centralized URL validation function
        return validateAndSanitizeUrl(url, {
            logErrors: true,
            additionalBannedDomains: [] // Add any service-specific banned domains here
        });
    }

    /**
     * Scrape content from a URL using Puppeteer
     * @param url URL to scrape
     * @returns Scraped content
     */
    public async scrapeUrl(url: string): Promise<ScrapedContent> {
        const operationId = `puppeteer-${Date.now().toString(36)}`;
        const startTime = Date.now();

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
                        
                    edgeLogger.info('Web scraping cache hit', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: 'web_scraping_cache_hit',
                        operationId,
                        url: sanitizedUrl
                    });

                    return {
                        content: this.formatContent(cachedResult),
                        title: cachedResult.title || 'Untitled Page',
                        url: sanitizedUrl,
                        timestamp: Date.now()
                    };
                } catch (error) {
                    // If parsing fails, log it but continue to fetch fresh content
                    edgeLogger.warn('Failed to process cached content, fetching fresh data', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: 'cache_processing_error',
                        operationId,
                        url: sanitizedUrl,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    // Cache error, continue to fresh scraping
                }
            }

            // Log scraping start
            edgeLogger.info('Web scraping started', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'web_scraping_started',
                operationId,
                url: sanitizedUrl
            });

            // Call scraper
            const result = await this.callPuppeteerScraper(sanitizedUrl);

            // Cache result
            await cacheService.setScrapedContent(sanitizedUrl, JSON.stringify(result));

            const duration = Date.now() - startTime;

            // Log successful scraping
            edgeLogger.info('Web scraping completed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'web_scraping_success',
                operationId,
                durationMs: duration,
                url: sanitizedUrl,
                contentLength: result.content?.length || result.text?.length || 0
            });

            // Format and return content
            return {
                content: this.formatContent(result),
                title: result.title || 'Untitled Page',
                url: sanitizedUrl,
                timestamp: Date.now()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            // Log error
            edgeLogger.error('Web scraping failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'web_scraping_error',
                operationId,
                url,
                errorMessage,
                durationMs: duration
            });

            throw error;
        }
    }

    /**
     * Call the Puppeteer scraper to extract content from a URL
     * @param url URL to scrape
     * @returns Raw puppeteer response data
     */
    private async callPuppeteerScraper(url: string): Promise<PuppeteerResponseData> {
        try {
            // Prepare request with proper headers
            const response = await fetch(SCRAPER_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 SanDiego/1.0',
                    'Accept': 'application/json, text/html'
                },
                body: JSON.stringify({ 
                    url,
                    format: 'json' // Explicitly request JSON format
                })
            });

            if (!response.ok) {
                throw new Error(`Scraper returned status ${response.status}`);
            }

            const responseText = await response.text();
            const contentType = response.headers.get('content-type') || '';

            // Parse JSON response
            let jsonData;
            try {
                // Check if response is already JSON
                if (contentType.includes('application/json')) {
                    jsonData = JSON.parse(responseText);
                } else {
                    // Handle HTML/text responses by wrapping in a JSON structure
                    edgeLogger.info('Received non-JSON response, converting to JSON format', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: 'html_to_json_conversion',
                        contentType,
                        responseTextLength: responseText.length
                    });
                    
                    // Extract title if possible
                    const titleMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i);
                    const title = titleMatch ? titleMatch[1].trim() : 'Untitled Page';
                    
                    // Create a JSON structure with the HTML content
                    jsonData = {
                        content: responseText,
                        title: title,
                        url: url
                    };
                }
            } catch (error) {
                edgeLogger.error('Failed to parse JSON response', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: 'json_parse_error',
                    responseTextLength: responseText.length,
                    responseTextPreview: responseText.substring(0, 200),
                    contentType
                });
                throw new Error('Failed to parse scraper response');
            }

            // Normalize response format
            let result: PuppeteerResponseData;

            if (Array.isArray(jsonData)) {
                if (jsonData.length > 0 && jsonData[0].data) {
                    // Format: [{ data: {...} }]
                    result = jsonData[0].data;
                } else if (jsonData.length > 0) {
                    // Format: [{ content, title, ... }]
                    result = jsonData[0];
                } else {
                    // Empty array
                    throw new Error('Scraper returned empty data');
                }
            } else if (typeof jsonData === 'object' && jsonData !== null) {
                // Format: { content, title, ... }
                result = jsonData;
            } else {
                throw new Error('Unexpected response format from scraper');
            }

            // Ensure content field exists
            if (!result.content && result.text) {
                result.content = result.text;
            }

            return result;
        } catch (error) {
            edgeLogger.error('Error calling Puppeteer scraper', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'puppeteer_scraper_call_error',
                url,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Format scraped content for consumption
     * @param data Raw Puppeteer response data
     * @returns Formatted content string
     */
    private formatContent(data: PuppeteerResponseData): string {
        // If content is already formatted, return as is
        if (data.content) {
            // Check if content is HTML and needs processing
            if (data.content.includes('<!DOCTYPE html>') || data.content.includes('<html')) {
                // This appears to be raw HTML content - extract readable text
                try {
                    edgeLogger.info('Processing HTML content for better readability', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: 'html_content_processing',
                        contentLength: data.content.length
                    });
                    
                    // Extract meaningful content from HTML
                    // 1. Extract title
                    let title = data.title || '';
                    if (!title) {
                        const titleMatch = data.content.match(/<title[^>]*>([^<]+)<\/title>/i);
                        title = titleMatch ? titleMatch[1].trim() : 'Untitled Page';
                    }
                    
                    // 2. Extract meta description
                    let description = '';
                    const descriptionMatch = data.content.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
                    if (descriptionMatch) {
                        description = descriptionMatch[1].trim();
                    }
                    
                    // 3. Extract main content - focus on common content containers
                    let mainContent = '';
                    
                    // Try to find main content elements
                    const contentElements = [
                        /<article[^>]*>([\s\S]*?)<\/article>/gi,
                        /<main[^>]*>([\s\S]*?)<\/main>/gi,
                        /<div[^>]*(?:class|id)="(?:content|main|post)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                        /<div[^>]*(?:class|id)="(?:blog-post|article|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
                    ];
                    
                    // Try each pattern until we find content
                    for (const pattern of contentElements) {
                        const matches = [...data.content.matchAll(pattern)];
                        if (matches.length > 0) {
                            // Use the longest match as it's likely the main content
                            const sortedMatches = matches.sort((a, b) => 
                                (b[1]?.length || 0) - (a[1]?.length || 0));
                            mainContent = sortedMatches[0][1];
                            break;
                        }
                    }
                    
                    // If we couldn't find main content elements, use the body content
                    if (!mainContent) {
                        const bodyMatch = data.content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                        if (bodyMatch) {
                            mainContent = bodyMatch[1];
                        } else {
                            // Fallback to the whole HTML
                            mainContent = data.content;
                        }
                    }
                    
                    // Remove scripts, styles, and other non-content elements
                    mainContent = mainContent
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
                        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
                        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
                    
                    // Convert HTML to plain text (simple version)
                    const plainText = mainContent
                        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
                        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
                        .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 [$1]')
                        .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
                        .trim();
                    
                    // Build formatted content
                    let formattedContent = '';
                    
                    // Add title
                    formattedContent += `# ${title}\n\n`;
                    
                    // Add URL and description
                    formattedContent += `URL: ${data.url || 'Unknown URL'}\n\n`;
                    if (description) {
                        formattedContent += `**Description**: ${description}\n\n`;
                    }
                    
                    // Add main content
                    formattedContent += plainText;
                    
                    return formattedContent;
                } catch (error) {
                    // Log error but continue with default processing
                    edgeLogger.error('Error processing HTML content', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: 'html_processing_error',
                        error: error instanceof Error ? error.message : String(error)
                    });
                    
                    // Fall back to default formatting
                    return `# ${data.title || 'Untitled Page'}\n\nURL: ${data.url || 'Unknown URL'}\n\n${data.content}`;
                }
            }
            
            return data.content;
        }

        // Start building formatted content
        let formattedContent = '';

        // Add title if available
        if (data.title) {
            formattedContent += `# ${data.title}\n\n`;
        }

        // Add URL if available
        if (data.url) {
            formattedContent += `URL: ${data.url}\n\n`;
        }

        // Use text as main content if available, otherwise use empty string
        const content = data.text || '';

        // Calculate statistics for logging
        const stats = this.calculateStats(content);

        // Return the formatted content
        return formattedContent + content;
    }

    /**
     * Calculate statistics about the scraped content
     * @param content The scraped content
     * @returns Statistics about the content
     */
    private calculateStats(content: string): ScraperStats {
        const characterCount = content.length;
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        const paragraphCount = content.split(/\n\s*\n/).filter(Boolean).length;
        const linkCount = (content.match(/https?:\/\/[^\s]+/g) || []).length;
        const headingCount = (content.match(/^#+\s+.+$/gm) || []).length;

        return {
            characterCount,
            wordCount,
            paragraphCount,
            linkCount,
            headingCount
        };
    }
}

// Export a singleton instance
export const puppeteerService = new PuppeteerService(); 