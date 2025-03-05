import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { createBasicTool } from '../core/agent-tools';
import { createLogger } from '../../utils/client-logger';

const logger = createLogger('agent:tools:web-scraper');

/**
 * URL detection regex pattern
 * Matches URLs with or without protocol
 */
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Ensures URL has a protocol
 */
function ensureProtocol(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Extracts URLs from text
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? Array.from(new Set(matches)) : []; // Remove duplicates
}

/**
 * Scrapes content from a URL
 */
async function scrapeUrl(url: string): Promise<{
  title: string;
  description: string;
  content: string;
  url: string;
}> {
  const startTime = performance.now();
  const fullUrl = ensureProtocol(url);
  
  try {
    logger.debug('Scraping URL', { url: fullUrl });
    
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 10000, // 10 second timeout
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
    
    // Extract description
    const description = $('meta[name="description"]').attr('content') || 
                        $('meta[property="og:description"]').attr('content') || 
                        $('p').first().text().trim().substring(0, 200) || 
                        'No description found';
    
    // Extract main content
    // First try to find main content containers
    let contentSelectors = ['article', 'main', '.content', '#content', '.post', '.article'];
    let content = '';
    
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        break;
      }
    }
    
    // If no content found, extract from paragraphs
    if (!content) {
      content = $('p').map((_, el) => $(el).text().trim()).get().join('\n\n');
    }
    
    // If still no content, get body text
    if (!content) {
      content = $('body').text().trim();
    }
    
    // Clean up content
    content = content
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // Limit content length
    
    const endTime = performance.now();
    logger.info('URL scraped successfully', {
      url: fullUrl,
      executionTimeMs: Math.round(endTime - startTime)
    });
    
    return {
      title,
      description,
      content,
      url: fullUrl
    };
  } catch (error) {
    const endTime = performance.now();
    logger.error('Error scraping URL', {
      url: fullUrl,
      error,
      executionTimeMs: Math.round(endTime - startTime)
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
 * Web scraper tool for agents
 * Extracts content from a URL
 */
export const webScraperTool = createBasicTool(
  'webScraper',
  'Scrapes content from a URL. Extracts the title, description, and main content.',
  z.object({
    url: z.string().describe('The URL to scrape. Will be automatically detected if not provided.'),
  }),
  async ({ url }) => {
    return await scrapeUrl(url);
  }
);

/**
 * URL detection tool for agents
 * Automatically detects URLs in text and scrapes them
 */
export const urlDetectionTool = createBasicTool(
  'detectAndScrapeUrls',
  'Automatically detects URLs in text and scrapes their content.',
  z.object({
    text: z.string().describe('The text that may contain URLs'),
  }),
  async ({ text }) => {
    const urls = extractUrls(text);
    
    if (urls.length === 0) {
      return {
        detected: false,
        message: 'No URLs detected in the text',
        urls: []
      };
    }
    
    logger.info(`Detected ${urls.length} URLs in text`, { urls });
    
    // Only scrape the first URL to avoid overloading
    const firstUrl = urls[0];
    const scrapedContent = await scrapeUrl(firstUrl);
    
    return {
      detected: true,
      message: `Detected ${urls.length} URLs. Scraped the first one: ${firstUrl}`,
      urls,
      scrapedContent
    };
  }
); 