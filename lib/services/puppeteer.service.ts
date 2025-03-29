/**
 * Puppeteer Web Scraping Service
 * 
 * This service provides an interface for extracting content from web pages
 * using a Puppeteer-based scraper. It's designed to be used by the Web Scraper
 * tool in the chat engine.
 */

import { edgeLogger } from '../logger/edge-logger';
import { LOG_CATEGORIES } from '../logger/constants';
import { LRUCache } from 'lru-cache';

// Constants
const SCRAPER_ENDPOINT = process.env.SCRAPER_ENDPOINT || 'https://us-central1-puppeteer-n8n.cloudfunctions.net/puppeteerFunction';
const CACHE_MAX_SIZE = 100; // Maximum number of items in cache
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

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
    private cache: LRUCache<string, PuppeteerResponseData>;

    constructor() {
        // Initialize LRU cache
        this.cache = new LRUCache<string, PuppeteerResponseData>({
            max: CACHE_MAX_SIZE,
            ttl: CACHE_TTL,
            allowStale: false
        });

        edgeLogger.info('Puppeteer service initialized', {
            category: LOG_CATEGORIES.TOOLS,
            operation: 'puppeteer_service_init',
            cacheMax: CACHE_MAX_SIZE,
            cacheTTL: CACHE_TTL
        });
    }

    /**
     * Validate and sanitize a URL before scraping
     * @param url URL to validate
     * @returns Sanitized URL or null if invalid
     */
    public validateAndSanitizeUrl(url: string): string | null {
        try {
            // Check if URL is already well-formed
            const normalizedUrl = url.trim();

            // Add protocol if missing
            let processedUrl = normalizedUrl;
            if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
                processedUrl = 'https://' + normalizedUrl;
            }

            // Test URL validity with URL constructor
            const urlObj = new URL(processedUrl);
            const sanitizedUrl = urlObj.toString();

            // Ban list check
            const bannedDomains = ['localhost', '127.0.0.1', 'internal', '.local'];
            const isBanned = bannedDomains.some(domain => urlObj.hostname.includes(domain));
            if (isBanned) {
                edgeLogger.error('Web scraping - banned domain detected', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: 'url_validation_failed',
                    reason: 'banned_domain',
                    url: sanitizedUrl
                });
                return null;
            }

            return sanitizedUrl;
        } catch (error) {
            edgeLogger.error('Web scraping - URL validation failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'url_validation_failed',
                url,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
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
            const cachedResult = this.cache.get(sanitizedUrl);
            if (cachedResult) {
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
            this.cache.set(sanitizedUrl, result);

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
                    'User-Agent': 'Mozilla/5.0 SanDiego/1.0'
                },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                throw new Error(`Scraper returned status ${response.status}`);
            }

            const responseText = await response.text();

            // Parse JSON response
            let jsonData;
            try {
                jsonData = JSON.parse(responseText);
            } catch (error) {
                edgeLogger.error('Failed to parse JSON response', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: 'json_parse_error',
                    responseTextLength: responseText.length,
                    responseTextPreview: responseText.substring(0, 200)
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
        const stats = this.calculateStats(data);

        // Return the formatted content
        return formattedContent + content;
    }

    /**
     * Calculate statistics about the scraped content
     * @param data Raw Puppeteer response data
     * @returns Statistics about the content
     */
    private calculateStats(data: PuppeteerResponseData): ScraperStats {
        const content = data.content || data.text || '';
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        const characterCount = content.length;

        return {
            characterCount,
            wordCount,
            paragraphCount: 0, // Would require more parsing to determine paragraphs
            linkCount: data.links?.length || 0,
            headingCount: 0 // Would require more parsing to determine headings
        };
    }
}

// Export a singleton instance
export const puppeteerService = new PuppeteerService(); 