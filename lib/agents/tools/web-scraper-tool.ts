import { tool } from 'ai';
import { z } from 'zod';
import { ensureProtocol, extractUrls } from '../../chat/url-utils';
import { edgeLogger } from '../../logger/edge-logger';
import { LRUCache } from 'lru-cache';

/**
 * Interface for scraped content response
 */
interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
}

/**
 * Stats interface for scraper metrics
 */
interface ScraperStats {
  headers: number;
  paragraphs: number;
  lists: number;
  other: number;
  characterCount?: number;
  wordCount?: number;
}

/**
 * Response interface for the puppeteer function
 */
interface PuppeteerResponseData {
  url: string;
  title: string;
  description: string;
  content: string;
  headers?: string[];
  paragraphs?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;  // Allow for additional fields in the response
  accessCount?: number;
}

/**
 * Rate limiter for scraping requests
 */
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 1000, // Minimum 1 second between requests

  canMakeRequest(): boolean {
    const now = Date.now();
    return now - this.lastRequestTime >= this.minInterval;
  },

  recordRequest() {
    this.lastRequestTime = Date.now();
  }
};

// Cache configuration
const CACHE_CONFIG = {
  maxSize: 50,           // Store up to 50 URLs
  ttl: 1000 * 60 * 360, // Cache for 6 hours (increased from 30 minutes)
  warmupInterval: 1000 * 60 * 180 // Warm up cache every 3 hours
};

// Add cache for scraped content
const scraperCache = new LRUCache<string, PuppeteerResponseData>({
  max: CACHE_CONFIG.maxSize,
  ttl: CACHE_CONFIG.ttl
});

// Add cache for formatted content
const formattedContentCache = new LRUCache<string, string>({
  max: CACHE_CONFIG.maxSize,
  ttl: CACHE_CONFIG.ttl
});

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  warmups: 0,
  lastWarmup: 0
};

// Cache warming function
async function warmCache() {
  const now = Date.now();
  if (now - cacheStats.lastWarmup < CACHE_CONFIG.warmupInterval) {
    return; // Skip if last warmup was too recent
  }
  
  try {
    // Get most frequently accessed URLs from cache
    const entries = Array.from(scraperCache.entries())
      .sort((a, b) => (b[1].accessCount || 0) - (a[1].accessCount || 0))
      .slice(0, 5); // Warm up top 5 most accessed URLs
    
    for (const [url, data] of entries) {
      if (scraperCache.has(url)) {
        // Only warm up if close to expiration
        const ttlRemaining = scraperCache.getRemainingTTL(url);
        if (ttlRemaining && ttlRemaining < CACHE_CONFIG.ttl / 2) {
          edgeLogger.info('Warming up cache for URL', { url });
          await callPuppeteerScraper(url);
          cacheStats.warmups++;
        }
      }
    }
    
    cacheStats.lastWarmup = now;
    
    // Log cache statistics
    edgeLogger.info('Cache statistics', { 
      ...cacheStats,
      cacheSize: scraperCache.size,
      formattedCacheSize: formattedContentCache.size
    });
  } catch (error) {
    edgeLogger.error('Cache warmup failed', { 
      error: error instanceof Error ? error : new Error(String(error))
    });
  }
}

// Set up periodic cache warming
if (typeof setInterval !== 'undefined') {
  setInterval(warmCache, CACHE_CONFIG.warmupInterval);
}

/**
 * Call the Google Cloud Puppeteer function to scrape a URL
 */
async function callPuppeteerScraper(url: string): Promise<PuppeteerResponseData> {
  const startTime = performance.now();
  const fullUrl = ensureProtocol(url);
  
  // Check cache first
  const cachedResult = scraperCache.get(fullUrl);
  if (cachedResult) {
    // Update access count
    cachedResult.accessCount = (cachedResult.accessCount || 0) + 1;
    scraperCache.set(fullUrl, cachedResult); // Update in cache
    
    cacheStats.hits++;
    edgeLogger.info('[PUPPETEER SCRAPER] Cache hit', { 
      url: fullUrl, 
      cacheHit: true,
      accessCount: cachedResult.accessCount
    });
    return cachedResult;
  }
  
  cacheStats.misses++;
  
  try {
    edgeLogger.info('[PUPPETEER SCRAPER] Starting to scrape URL', { url: fullUrl });
    
    // Check rate limiting
    if (!rateLimiter.canMakeRequest()) {
      edgeLogger.warn('[PUPPETEER SCRAPER] Rate limited, waiting', { url: fullUrl });
      await new Promise(resolve => setTimeout(resolve, rateLimiter.minInterval));
    }
    
    // Record this request for rate limiting
    rateLimiter.recordRequest();
    
    // Timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
    
    try {
      // Get configured endpoint or use default
      const scraperEndpoint = process.env.SCRAPER_ENDPOINT || 'https://us-central1-puppeteer-n8n.cloudfunctions.net/puppeteerFunction';
      
      edgeLogger.info('[PUPPETEER SCRAPER] Using endpoint', { endpoint: scraperEndpoint });
      
      const response = await fetch(scraperEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SanDiegoApp/1.0; +https://app.example.com)',
        },
        body: JSON.stringify({
          url: fullUrl,
          format: 'json'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      // Get raw text response first to help with debugging
      const rawResponseText = await response.text();
      edgeLogger.debug('[PUPPETEER SCRAPER] Raw response received', {
        responseLength: rawResponseText.length,
        responsePreview: rawResponseText.substring(0, 100)
      });
      
      // Parse the JSON response with error handling
      let rawResponse;
      try {
        rawResponse = JSON.parse(rawResponseText);
      } catch (error) {
        edgeLogger.error('[PUPPETEER SCRAPER] Failed to parse JSON response', { 
          error: error instanceof Error ? error.message : String(error),
          responsePreview: rawResponseText.substring(0, 100)
        });
        throw new Error('Invalid JSON response from scraper');
      }
      
      // Log the structure of the raw response
      edgeLogger.info('[PUPPETEER SCRAPER] Response structure', {
        isArray: Array.isArray(rawResponse),
        responseType: typeof rawResponse,
        hasFirstItem: Array.isArray(rawResponse) && rawResponse.length > 0,
        firstItemKeys: Array.isArray(rawResponse) && rawResponse.length > 0 
          ? Object.keys(rawResponse[0]) 
          : 'no-first-item',
        hasData: Array.isArray(rawResponse) && rawResponse.length > 0 && 'data' in rawResponse[0]
      });
      
      // HANDLE THE SPECIFIC FORMAT FROM THE USER'S EXAMPLE
      let responseData: any = null;
      
      // Format 1: Array with objects that have a 'data' property
      // [{ data: { url, title, description, content } }]
      if (Array.isArray(rawResponse) && 
          rawResponse.length > 0 && 
          rawResponse[0] && 
          typeof rawResponse[0] === 'object' && 
          'data' in rawResponse[0]) {
        
        responseData = rawResponse[0].data;
        edgeLogger.info('[PUPPETEER SCRAPER] Found format: Array with data property', {
          dataKeys: Object.keys(responseData)
        });
      }
      // Format 2: Direct array item with properties
      // [{ url, title, description, content }]
      else if (Array.isArray(rawResponse) && 
               rawResponse.length > 0 && 
               rawResponse[0] && 
               typeof rawResponse[0] === 'object') {
        
        responseData = rawResponse[0];
        edgeLogger.info('[PUPPETEER SCRAPER] Found format: Direct array item', {
          dataKeys: Object.keys(responseData)
        });
      }
      // Format 3: Direct object 
      // { url, title, description, content }
      else if (!Array.isArray(rawResponse) && 
               rawResponse && 
               typeof rawResponse === 'object') {
        
        responseData = rawResponse;
        edgeLogger.info('[PUPPETEER SCRAPER] Found format: Direct object', {
          dataKeys: Object.keys(responseData)
        });
      }
      else {
        edgeLogger.warn('[PUPPETEER SCRAPER] Unrecognized response format', {
          responseType: typeof rawResponse,
          isArray: Array.isArray(rawResponse),
          preview: JSON.stringify(rawResponse).substring(0, 100)
        });
        throw new Error('Unrecognized response format from scraper');
      }
      
      // Validate the required fields
      if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid response data structure');
      }
      
      // Create a clean result with fallbacks for missing fields
      const MAX_CONTENT_LENGTH = 50000;
      
      const result: PuppeteerResponseData = {
        url: typeof responseData.url === 'string' ? responseData.url : fullUrl,
        title: typeof responseData.title === 'string' ? responseData.title : 'No title found',
        description: typeof responseData.description === 'string' ? responseData.description : 'No description found',
        content: typeof responseData.content === 'string' 
          ? (responseData.content.length > MAX_CONTENT_LENGTH 
             ? responseData.content.substring(0, MAX_CONTENT_LENGTH) + '... [content truncated]' 
             : responseData.content)
          : 'No content found',
      };
      
      const executionTimeMs = Math.round(performance.now() - startTime);
      
      edgeLogger.info('[PUPPETEER SCRAPER] URL scraped successfully', { 
        url: fullUrl,
        executionTimeMs,
        contentLength: result.content?.length || 0
      });
      
      // Store in cache
      scraperCache.set(fullUrl, result);
      
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    
    edgeLogger.error('[PUPPETEER SCRAPER] Failed to scrape URL', { 
      url: fullUrl,
      executionTimeMs,
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    // Return error information
    return {
      url: fullUrl,
      title: 'Error',
      description: 'Failed to scrape content',
      content: `Failed to scrape content from ${fullUrl}. Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Format the puppeteer response for better readability
 */
function formatPuppeteerResponse(data: PuppeteerResponseData): string {
  // Check cache first
  const cacheKey = `${data.url}:${data.content?.length || 0}`;
  const cachedFormatted = formattedContentCache.get(cacheKey);
  if (cachedFormatted) {
    edgeLogger.debug('[PUPPETEER FORMATTER] Using cached formatted content', { url: data.url });
    return cachedFormatted;
  }
  
  // Create a markdown-formatted string with the content
  let formattedContent = `# ${data.title}\n\n`;
  
  if (data.description) {
    formattedContent += `${data.description}\n\n`;
  }
  
  // Safety check - limit content length
  const MAX_CONTENT_LENGTH = 40000;
  const content = typeof data.content === 'string' 
    ? (data.content.length > MAX_CONTENT_LENGTH 
       ? data.content.substring(0, MAX_CONTENT_LENGTH) + '... [content truncated]'
       : data.content)
    : '';

  // Add structured content sections
  if (data.headers && data.headers.length > 0) {
    formattedContent += '## Main Sections\n\n';
    data.headers.slice(0, 10).forEach(h => {
      formattedContent += `- ${h}\n`;
    });
    formattedContent += '\n';
  }
  
  // Add paragraphs directly if available
  if (data.paragraphs && data.paragraphs.length > 0) {
    formattedContent += '## Content\n\n';
    // Take only first 20 paragraphs to keep size reasonable
    data.paragraphs.slice(0, 20).forEach(p => {
      formattedContent += `${p.trim()}\n\n`;
    });
  }
  // Otherwise use the content directly, with basic paragraph splitting
  else if (content) {
    formattedContent += '## Content\n\n';
    
    const paragraphs = content
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 20) // Skip very short bits that might be nav/menu items
      .slice(0, 20); // Limit to 20 paragraphs
    
    paragraphs.forEach(p => {
      formattedContent += `${p}\n\n`;
    });
  }
  
  // Simple checks for contact information (avoid extensive regex)
  if (content.includes('@') || content.includes('phone') || content.includes('contact')) {
    formattedContent += '## Contact Information\n\n';
    
    // Simple email extraction
    const emailMatches = content.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    if (emailMatches.length > 0) {
      formattedContent += 'Email: ' + emailMatches.slice(0, 3).join(', ') + '\n\n';
    }
    
    // Simple phone extraction - don't do complex regex
    const phoneSection = content.indexOf('phone') > -1 
      ? content.substring(content.indexOf('phone') - 30, content.indexOf('phone') + 30) 
      : '';
    
    if (phoneSection) {
      formattedContent += `Possible phone information: ${phoneSection}\n\n`;
    }
  }
  
  // Store in cache
  formattedContentCache.set(cacheKey, formattedContent);
  
  return formattedContent;
}

/**
 * Calculate stats about the scraped content
 */
function calculateStats(data: PuppeteerResponseData): ScraperStats {
  try {
    const headers = Array.isArray(data.headers) ? data.headers.length : 0;
    const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs.length : 0;
    
    // Count basic statistics from the content if we don't have structured data
    const content = typeof data.content === 'string' ? data.content : '';
    const characterCount = content.length;
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    // Count list items as a rough estimate - limit regex to avoid catastrophic backtracking
    const contentSample = content.substring(0, 20000); // Only check first 20k chars
    const listItems = (contentSample.match(/^[-*•]\s+/gm) || []).length;
    
    return {
      headers,
      paragraphs,
      lists: Math.min(50, Math.ceil(listItems / 3)), // Rough estimate, max 50
      other: 1, // Always at least the title and description
      characterCount,
      wordCount: Math.min(wordCount, 100000) // Cap at 100k to prevent integer overflow
    };
  } catch (error) {
    edgeLogger.error('[PUPPETEER STATS] Error calculating stats', { 
      error: error instanceof Error ? error : new Error(String(error))
    });
    // Return empty stats on error
    return {
      headers: 0,
      paragraphs: 0,
      lists: 0,
      other: 0,
      characterCount: data.content?.length || 0,
      wordCount: 0
    };
  }
}

/**
 * The web scraper tool definition
 */
export const webScraperTool = tool({
  description: 'Extract content from a webpage using a powerful Puppeteer-based scraper that can handle JavaScript-rendered content',
  parameters: z.object({
    url: z.string().describe('The URL to scrape')
  }),
  execute: async ({ url }): Promise<{
    title: string;
    description: string;
    url: string;
    message: string;
    content: string;
    stats: ScraperStats
  }> => {
    const startTime = performance.now();
    const fullUrl = ensureProtocol(url);
    
    // Set a timeout for the entire operation
    let timeoutHandler: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandler = setTimeout(() => {
        reject(new Error('Web scraper operation timed out after 30 seconds'));
      }, 30000);
    });
    
    try {
      // Race against timeout
      const scrapedData = await Promise.race([
        callPuppeteerScraper(fullUrl),
        timeoutPromise
      ]);
      
      // Format the content (with caching)
      const formattedContent = formatPuppeteerResponse(scrapedData);
      
      // Calculate stats - only log at debug level
      edgeLogger.debug('[WEB SCRAPER TOOL] Calculating stats', { url: fullUrl });
      const stats = calculateStats(scrapedData);
      
      const executionTimeMs = Math.round(performance.now() - startTime);
      
      edgeLogger.info('[WEB SCRAPER TOOL] URL processed successfully', { 
        url: fullUrl, 
        executionTimeMs
      });
      
      // Return the scraped content
      return {
        title: scrapedData.title,
        description: scrapedData.description,
        url: fullUrl,
        message: `Scraped content from ${fullUrl} using Puppeteer`,
        content: formattedContent,
        stats
      };
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      
      edgeLogger.error('[WEB SCRAPER TOOL] Failed to process URL', { 
        url: fullUrl, 
        executionTimeMs,
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      // Return error information
      return {
        title: 'Error',
        description: 'Failed to scrape content',
        url: fullUrl,
        message: `Failed to scrape content from ${fullUrl}: ${error instanceof Error ? error.message : String(error)}`,
        content: `# Error\n\nFailed to scrape content from ${fullUrl}.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
        stats: {
          headers: 0,
          paragraphs: 0,
          lists: 0,
          other: 0,
          characterCount: 0,
          wordCount: 0
        }
      };
    } finally {
      // Clean up timeout
      if (timeoutHandler) {
        clearTimeout(timeoutHandler);
      }
    }
  }
});

/**
 * URL detection and scraping tool
 */
export const detectAndScrapeUrlsTool = tool({
  description: 'Automatically detects URLs in text and scrapes their content using Puppeteer. Only use when text contains valid URLs.',
  parameters: z.object({
    text: z.string().describe('The text that might contain URLs')
  }),
  execute: async ({ text }): Promise<{ 
    message: string; 
    urls: Array<{ url: string; title: string; content: string }> 
  }> => {
    try {
      // Extract URLs from text
      const rawUrls = extractUrls(text);
      
      // If no URLs are detected, return early
      if (rawUrls.length === 0) {
        edgeLogger.info('[URL DETECTION] No URLs found in text', { 
          textPreview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        });
        
        return {
          message: 'No URLs detected in the text.',
          urls: []
        };
      }
      
      // Add https:// protocol to all URLs if missing
      const urls = rawUrls.map(url => ensureProtocol(url));
      
      // Log detected URLs
      edgeLogger.info('[URL DETECTION] Found URLs in text', { 
        urlCount: urls.length,
        originalUrls: rawUrls.slice(0, 5), // Log original URLs
        processedUrls: urls.slice(0, 5)    // Log processed URLs with protocol
      });
      
      // Only scrape the first URL to avoid overwhelming the system
      const firstUrl = urls[0];
      
      try {
        // Use the Puppeteer scraper for content extraction
        const scrapedContent = await webScraperTool.execute({ url: firstUrl }, { 
          toolCallId: 'internal-url-scraper-call',
          messages: []
        });
        
        return {
          message: `Detected ${urls.length} URL(s). Scraped content from ${firstUrl} using Puppeteer`,
          urls: [
            {
              url: firstUrl,
              title: scrapedContent.title,
              content: scrapedContent.content
            }
          ]
        };
      } catch (scrapingError) {
        // Log the error but continue with the query
        edgeLogger.error('[URL DETECTION] Failed to scrape URL', { 
          url: firstUrl,
          error: scrapingError instanceof Error ? {
            name: scrapingError.name,
            message: scrapingError.message,
            stack: scrapingError.stack
          } : String(scrapingError)
        });
        
        // Return partial information even if scraping failed
        return {
          message: `Detected ${urls.length} URL(s). Failed to scrape content from ${firstUrl}. Error: ${scrapingError instanceof Error ? scrapingError.message : String(scrapingError)}`,
          urls: [
            {
              url: firstUrl,
              title: 'Error: Failed to scrape content',
              content: `Unable to retrieve content from ${firstUrl}. This could be due to site restrictions, invalid URL format, or connection issues.`
            }
          ]
        };
      }
    } catch (error) {
      edgeLogger.error('[URL DETECTION] Failed', { 
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      });
      
      return {
        message: `Error detecting or scraping URLs: ${error instanceof Error ? error.message : String(error)}`,
        urls: []
      };
    }
  }
});

/**
 * Export both tools together
 */
export const webScrapeTools = {
  webScraper: webScraperTool,
  detectAndScrapeUrls: detectAndScrapeUrlsTool
}; 