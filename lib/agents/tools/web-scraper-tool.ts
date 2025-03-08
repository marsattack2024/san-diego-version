import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { createBasicTool } from '../core/agent-tools';
import { clientLogger } from '../../logger/client-logger';
import { extractUrls as extractUrlsFromUtils, ensureProtocol } from '../../chat/url-utils';

// URL detection regex pattern
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\.?/gi;

// Create a component-specific logger wrapper
const logger = {
  debug: (message: string, context = {}) => clientLogger.debug(`[agent:tools:web-scraper] ${message}`, context),
  info: (message: string, context = {}) => clientLogger.info(`[agent:tools:web-scraper] ${message}`, context),
  warn: (message: string, context = {}) => clientLogger.warn(`[agent:tools:web-scraper] ${message}`, context),
  error: (message: string | Error, context = {}) => clientLogger.error(`[agent:tools:web-scraper] ${message}`, context)
};

// Define the ScrapedContent interface
export interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
}

/**
 * Scrapes content from a URL
 */
async function scrapeUrl(url: string, depth: number = 0, maxDepth: number = 1): Promise<{
  title: string;
  description: string;
  content: string;
  url: string;
  linkedContents?: Array<{url: string, title: string, content: string}>;
}> {
  const startTime = performance.now();
  const fullUrl = ensureProtocol(url);
  
  try {
    logger.debug('Scraping URL', { url: fullUrl, depth });
    
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 30000, // 30 second timeout (increased from 20s)
      maxContentLength: 10 * 1024 * 1024, // 10MB max content size
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Remove script, style, and hidden elements that don't contribute to visible content
    $('script, style, [style*="display:none"], [style*="display: none"], [hidden], .hidden, meta, link, noscript').remove();
    
    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
    
    // Extract description
    const description = $('meta[name="description"]').attr('content') || 
                        $('meta[property="og:description"]').attr('content') || 
                        $('p').first().text().trim().substring(0, 300) || 
                        'No description found';
    
    // Extract main content
    // First try to find main content containers
    let contentSelectors = [
      'article', 'main', '.content', '#content', '.post', '.article', 
      // Additional selectors for better content extraction
      '.entry-content', '.post-content', '.page-content', '.article-content',
      '.blog-post', '.story', '#main-content', '.main-content',
      '[role="main"]', '.body', '.entry', '.text', '.document',
      // Add more specific selectors for common website layouts
      '#primary', '.primary', '.container', '.wrapper', '.site-content',
      '.page', '.single', '.post-body', '.entry-body', '.article-body'
    ];
    let content = '';
    
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        break;
      }
    }
    
    // If no content found, extract from paragraphs and headings
    if (!content || content.length < 500) {
      content = $('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, pre, code')
        .map((_, el) => {
          const text = $(el).text().trim();
          // Add formatting based on element type
          if (el.name.startsWith('h')) {
            return `## ${text}\n\n`;
          }
          return `${text}\n\n`;
        })
        .get()
        .join('')
        .trim();
    }
    
    // If still no content, get body text
    if (!content || content.length < 200) {
      content = $('body').text().trim();
    }
    
    // Clean up content
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n') // Normalize multiple newlines
      .trim()
      .substring(0, 50000); // Increased character limit to 50k
    
    // Recursively scrape linked pages if depth < maxDepth
    let linkedContents: Array<{url: string, title: string, content: string}> | undefined = undefined;
    if (depth < maxDepth) {
      // Extract internal links from the same domain
      const currentDomain = new URL(fullUrl).hostname;
      const internalLinks = new Set<string>();
      
      $('a[href]').each((_, el) => {
        try {
          const href = $(el).attr('href');
          if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
          
          const absoluteUrl = href.startsWith('http') ? href : new URL(href, fullUrl).toString();
          const linkDomain = new URL(absoluteUrl).hostname;
          
          // Only include links from the same domain and limit to 3 links
          if (linkDomain === currentDomain && internalLinks.size < 3) {
            internalLinks.add(absoluteUrl);
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      });
      
      if (internalLinks.size > 0) {
        logger.info(`Found ${internalLinks.size} internal links to scrape`, { 
          parentUrl: fullUrl, 
          links: Array.from(internalLinks) 
        });
        
        // Scrape linked pages in parallel
        const linkedScrapingPromises = Array.from(internalLinks).map(link => 
          scrapeUrl(link, depth + 1, maxDepth)
            .then(result => ({
              url: result.url,
              title: result.title,
              content: result.content
            }))
            .catch(error => ({
              url: link,
              title: 'Error scraping linked page',
              content: `Failed to scrape: ${error instanceof Error ? error.message : String(error)}`
            }))
        );
        
        linkedContents = await Promise.all(linkedScrapingPromises);
      }
    }
    
    const endTime = performance.now();
    logger.info('URL scraped successfully', {
      url: fullUrl,
      executionTimeMs: Math.round(endTime - startTime),
      contentLength: content.length,
      depth,
      linkedPagesCount: linkedContents?.length || 0
    });
    
    return {
      title,
      description,
      content,
      url: fullUrl,
      ...(linkedContents && linkedContents.length > 0 ? { linkedContents } : {})
    };
  } catch (error) {
    const endTime = performance.now();
    logger.error('Error scraping URL', {
      url: fullUrl,
      error,
      executionTimeMs: Math.round(endTime - startTime),
      depth
    });
    
    return {
      title: 'Error',
      description: 'Failed to scrape URL',
      content: `Failed to scrape URL: ${error instanceof Error ? error.message : String(error)}`,
      url: fullUrl
    };
  }
}

/**
 * Scrapes all visible text from a page in a structured format
 */
async function scrapeAllText(url: string): Promise<{
  url: string;
  title: string;
  description: string;
  textContent: {
    headers: string[];
    paragraphs: string[];
    lists: { items: string[]; type: 'ordered' | 'unordered' }[];
    footer: string;
    other: string[];
  };
}> {
  const fullUrl = ensureProtocol(url);
  const startTime = performance.now();

  try {
    logger.debug('Scraping all text from page', { url: fullUrl });

    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // 10MB max content size
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract metadata
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
    const description = $('meta[name="description"]').attr('content') || 
                        $('meta[property="og:description"]').attr('content') || 
                        $('p').first().text().trim().substring(0, 300) || 
                        'No description found';

    // Initialize text content structure
    const textContent = {
      headers: [] as string[],
      paragraphs: [] as string[],
      lists: [] as { items: string[]; type: 'ordered' | 'unordered' }[],
      footer: '',
      other: [] as string[],
    };

    // Remove non-visible elements
    $('script, style, noscript, iframe, [hidden], [style*="display: none"], meta, link').remove();

    // Extract headers (h1-h6)
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const text = $(el).text().trim();
      if (text) textContent.headers.push(`${el.name.toUpperCase()}: ${text}`);
    });

    // Extract paragraphs
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text) textContent.paragraphs.push(text);
    });

    // Extract lists (ul, ol)
    $('ul, ol').each((_, el) => {
      const items = $(el)
        .find('li')
        .map((_, li) => $(li).text().trim())
        .get()
        .filter(text => text);
      
      if (items.length) {
        textContent.lists.push({
          items,
          type: $(el).is('ol') ? 'ordered' : 'unordered',
        });
      }
    });

    // Extract footer
    const footer = $('footer, .footer, [role="contentinfo"]').first();
    textContent.footer = footer.length ? footer.text().trim().replace(/\s+/g, ' ') : '';

    // Extract other visible text (e.g., divs, spans not already captured)
    $('body div, body span, body section, body article, body aside, body main, body nav')
      .each((_, el) => {
        // Skip elements that are children of already processed elements
        if ($(el).parents('h1, h2, h3, h4, h5, h6, p, ul, ol, li, footer, .footer, [role="contentinfo"]').length === 0) {
          const text = $(el).clone().children().remove().end().text().trim();
          if (text && text.length > 5) { // Only include text with meaningful length
            textContent.other.push(text);
          }
        }
      });

    // Clean up: remove duplicates and empty strings
    textContent.headers = [...new Set(textContent.headers.filter(Boolean))];
    textContent.paragraphs = [...new Set(textContent.paragraphs.filter(Boolean))];
    textContent.other = [...new Set(textContent.other.filter(Boolean))];

    const endTime = performance.now();
    logger.info('Page text scraped successfully', {
      url: fullUrl,
      executionTimeMs: Math.round(endTime - startTime),
      headerCount: textContent.headers.length,
      paragraphCount: textContent.paragraphs.length,
      listCount: textContent.lists.length,
      otherCount: textContent.other.length,
    });

    return {
      url: fullUrl,
      title,
      description,
      textContent,
    };
  } catch (error) {
    const endTime = performance.now();
    logger.error('Error scraping page text', { 
      url: fullUrl, 
      error,
      executionTimeMs: Math.round(endTime - startTime)
    });
    
    return {
      url: fullUrl,
      title: 'Error',
      description: 'Failed to scrape',
      textContent: {
        headers: [],
        paragraphs: [],
        lists: [],
        footer: '',
        other: [`Error: ${error instanceof Error ? error.message : String(error)}`],
      },
    };
  }
}

/**
 * Web scraper tool for agents
 * Extracts content from a URL
 */
export const webScraperTool = createBasicTool(
  'webScraper',
  'Scrapes content from a URL. Extracts the title, description, and main content. Can optionally scrape linked pages.',
  z.object({
    url: z.string().describe('The URL to scrape. Will be automatically detected if not provided.'),
    recursive: z.boolean().optional().describe('Whether to recursively scrape linked pages from the same domain. Default is false.'),
  }),
  async ({ url, recursive = false }) => {
    return await scrapeUrl(url, 0, recursive ? 1 : 0);
  }
);

/**
 * URL detection tool for agents
 * Automatically detects URLs in text and scrapes their content. Can optionally scrape linked pages recursively.
 */
export const urlDetectionTool = createBasicTool(
  'detectAndScrapeUrls',
  'Automatically detects URLs in text and scrapes their content. Can optionally scrape linked pages recursively.',
  z.object({
    text: z.string().describe('The text that may contain URLs'),
    recursive: z.boolean().optional().describe('Whether to recursively scrape linked pages from the same domain. Default is false.'),
  }),
  async ({ text, recursive = false }) => {
    const urls = extractUrlsFromUtils(text);
    
    if (urls.length === 0) {
      return {
        detected: false,
        message: 'No URLs detected in the text',
        urls: []
      };
    }
    
    logger.info(`Detected ${urls.length} URLs in text`, { urls });
    
    // Process up to 3 URLs instead of just the first one
    const urlsToProcess = urls.slice(0, 3);
    logger.info(`Processing ${urlsToProcess.length} URLs`, { urlsToProcess, recursive });
    
    try {
      // Process URLs in parallel
      const scrapingPromises = urlsToProcess.map(url => scrapeUrl(url, 0, recursive ? 1 : 0));
      const scrapedContents = await Promise.allSettled(scrapingPromises);
      
      // Extract successful results
      const successfulResults = scrapedContents
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
      
      // Extract failed results
      const failedUrls = scrapedContents
        .map((result, index) => result.status === 'rejected' ? urlsToProcess[index] : null)
        .filter(Boolean);
      
      if (successfulResults.length === 0) {
        return {
          detected: true,
          message: `Detected ${urls.length} URLs but failed to scrape any of them.`,
          urls,
          scrapedContents: []
        };
      }
      
      return {
        detected: true,
        message: `Detected ${urls.length} URLs. Successfully scraped ${successfulResults.length} URLs.${failedUrls.length > 0 ? ` Failed to scrape ${failedUrls.length} URLs.` : ''}`,
        urls,
        scrapedContents: successfulResults
      };
    } catch (error) {
      logger.error('Error processing URLs', { error, urls: urlsToProcess });
      
      return {
        detected: true,
        message: `Detected ${urls.length} URLs but encountered an error during scraping: ${error instanceof Error ? error.message : String(error)}`,
        urls,
        scrapedContents: []
      };
    }
  }
);

/**
 * Comprehensive text scraper tool for agents
 * Extracts all visible text from a page in a structured format
 */
export const allTextScraperTool = createBasicTool(
  'allTextScraper',
  'Scrapes all visible text from a page, categorized into headers, paragraphs, lists, footer, and other content.',
  z.object({
    url: z.string().describe('The URL to scrape'),
  }),
  async ({ url }) => {
    logger.info('Starting full text scrape', { url });
    const result = await scrapeAllText(url);
    logger.info('Full text scrape completed', { url });
    return result;
  }
);

/**
 * Extract URLs from a text string
 * Only detects properly formatted URLs (http/https or www.)
 * Avoids common false positives like 'e.g.' or other abbreviations
 */
export function extractUrls(text: string): string[] {
  // More precise regex that requires proper URL format
  // Matches http/https URLs or URLs starting with www.
  // Requires domain to have at least one dot and valid TLD characters
  const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))|(?:www\.[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/g;
  
  // Extract all potential URLs
  const matches = text.match(urlRegex) || [];
  
  // Filter out common false positives
  return matches.filter(url => {
    // Skip URLs that are likely abbreviations or examples
    if (/\be\.g\.\b/.test(url)) return false;
    if (/\bi\.e\.\b/.test(url)) return false;
    
    // Ensure URL has a valid domain structure
    return url.includes('.') && url.length > 4;
  });
} 