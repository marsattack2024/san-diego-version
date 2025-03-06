import { tool } from 'ai';
import { z } from 'zod';
import { findSimilarDocumentsOptimized } from '../vector/documentRetrieval';
import { createResource } from '../actions/resources';
import { edgeLogger } from '../logger/edge-logger';
import { OpenAI } from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractUrls, ensureProtocol } from './url-utils';
import type { RetrievedDocument } from '../../types/vector/vector';

// Define the type for scraped content
interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
}

// Define the stats type for scraper results
interface ScraperStats {
  headers: number;
  paragraphs: number;
  lists: number;
  other: number;
  characterCount?: number;
  wordCount?: number;
}

// Define the tools object
export const chatTools = {
  getInformation: tool({
    description: 'Search the knowledge base before answering any question',
    parameters: z.object({
      query: z.string().describe('the question to search for')
    }),
    execute: async ({ query }): Promise<string> => {
      try {
        const { documents } = await findSimilarDocumentsOptimized(query, {
          limit: 5, // Update to 5 to match the rest of the code
          similarityThreshold: 0.5
        });
        
        if (!documents || documents.length === 0) {
          return "No relevant information found in the knowledge base.";
        }

        // Format the results in a clean, readable format
        const formattedResults = documents.map((doc: RetrievedDocument, index: number) => {
          return `Document #${index + 1}: ${doc.metadata?.title || 'Untitled'}\n${doc.content}\n`;
        }).join('\n');

        return `Found ${documents.length} relevant documents:\n\n${formattedResults}`;
      } catch (error) {
        edgeLogger.error('Knowledge base search failed', {
          query,
          error
        });
        
        return `Knowledge base search failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }),

  addResource: tool({
    description: 'Store new information in the knowledge base',
    parameters: z.object({
      content: z.string().describe('the information to store')
    }),
    execute: async ({ content }) => {
      try {
        await createResource({ content });
        return { 
          success: true,
          message: 'Information stored successfully'
        };
      } catch (error) {
        edgeLogger.error('Failed to store information', { error });
        throw new Error('Failed to store information');
      }
    }
  }),

  // DeepSearch tool
  deepSearch: tool({
    description: 'Perform a deep search using Perplexity API to gather comprehensive information on a topic',
    parameters: z.object({
      query: z.string().describe('The search query to research')
    }),
    execute: async ({ query }): Promise<string> => {
      try {
        edgeLogger.info('[PERPLEXITY DEEP SEARCH] Starting search', { query });
        
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) {
          throw new Error('Perplexity API key is not configured');
        }
        
        const openai = new OpenAI({
          apiKey,
          baseURL: 'https://api.perplexity.ai',
        });
        
        const response = await openai.chat.completions.create({
          model: 'sonar-medium-online',
          messages: [
            { role: 'system', content: 'You are a helpful research assistant that provides comprehensive information.' },
            { role: 'user', content: query }
          ],
          max_tokens: 4000,
          temperature: 0.7,
        });
        
        const result = response.choices[0]?.message?.content || 'No results found';
        
        edgeLogger.info('[PERPLEXITY DEEP SEARCH] Search completed', {
          query,
          resultLength: result.length
        });
        
        return `DeepSearch Results for "${query}":\n\n${result}`;
      } catch (error) {
        edgeLogger.error('[PERPLEXITY DEEP SEARCH] Failed', {
          query,
          error
        });
        
        return `DeepSearch failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }),

  // Web scraper tool - now uses comprehensive scraper internally
  webScraper: tool({
    description: 'Scrape content from a URL. Extracts the title, description, and main content',
    parameters: z.object({
      url: z.string().describe('The URL to scrape')
    }),
    execute: async ({ url }): Promise<ScrapedContent> => {
      const startTime = performance.now();
      const fullUrl = ensureProtocol(url);
      
      try {
        edgeLogger.debug('[WEB SCRAPER] Starting to scrape URL', { url: fullUrl });
        
        // Use the comprehensive scraper internally
        const { title, description, textContent } = await scrapeComprehensively(fullUrl);
        
        // Calculate stats for logging
        const headerCount = textContent.headers.length;
        const paragraphCount = textContent.paragraphs.length;
        const listCount = textContent.lists.length;
        const otherCount = textContent.other.length;
        
        const executionTimeMs = Math.round(performance.now() - startTime);
        
        edgeLogger.info('[WEB SCRAPER] URL scraped successfully', { 
          url: fullUrl, 
          executionTimeMs,
          headerCount,
          paragraphCount,
          listCount,
          otherCount
        });
        
        // Return simplified content for the user
        return {
          title,
          description,
          content: `Scraped content from ${fullUrl}`,
          url: fullUrl
        };
      } catch (error) {
        const executionTimeMs = Math.round(performance.now() - startTime);
        edgeLogger.error('[WEB SCRAPER] Failed to scrape URL', { 
          url: fullUrl, 
          executionTimeMs,
          error: error instanceof Error ? error.message : String(error)
        });
        
        return {
          title: 'Error',
          description: 'Failed to scrape content',
          content: `Failed to scrape content from ${fullUrl}: ${error instanceof Error ? error.message : String(error)}`,
          url: fullUrl
        };
      }
    }
  }),

  // URL detection tool
  detectAndScrapeUrls: tool({
    description: 'Automatically detects URLs in text and scrapes their content',
    parameters: z.object({
      text: z.string().describe('The text that might contain URLs')
    }),
    execute: async ({ text }): Promise<{ message: string; urls: Array<{ url: string; title: string; content: string }> }> => {
      try {
        const urls = extractUrls(text);
        
        if (urls.length === 0) {
          return {
            message: 'No URLs detected in the text.',
            urls: []
          };
        }
        
        edgeLogger.info('[URL DETECTION] Found URLs in text', { 
          urlCount: urls.length,
          urls
        });
        
        // Only scrape the first URL to avoid overwhelming the system
        const firstUrl = urls[0];
        // Use non-null assertion since we know webScraper exists and has execute method
        const scrapedContent = await chatTools.webScraper.execute!({ url: firstUrl }, { 
          toolCallId: 'internal-url-scraper-call',
          messages: []
        });
        
        return {
          message: `Detected ${urls.length} URL(s). Scraped content from ${firstUrl}`,
          urls: [
            {
              url: firstUrl,
              title: scrapedContent.title,
              content: `Scraped content from ${firstUrl}`
            }
          ]
        };
      } catch (error) {
        edgeLogger.error('[URL DETECTION] Failed', { error });
        
        return {
          message: `Error detecting or scraping URLs: ${error instanceof Error ? error.message : String(error)}`,
          urls: []
        };
      }
    }
  }),

  // Add the comprehensive text scraper tool
  comprehensiveScraper: tool({
    description: 'Scrapes all visible text from a webpage in a structured format, categorizing content into headers, paragraphs, lists, and more. Use this for detailed analysis of webpage content.',
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
      
      try {
        edgeLogger.info('[COMPREHENSIVE SCRAPER] Starting to scrape URL', { url: fullUrl });
        
        const { title, description, textContent } = await scrapeComprehensively(fullUrl);
        
        // Calculate stats for logging
        const headerCount = textContent.headers.length;
        const paragraphCount = textContent.paragraphs.length;
        const listCount = textContent.lists.length;
        const otherCount = textContent.other.length;
        
        const executionTimeMs = Math.round(performance.now() - startTime);
        
        edgeLogger.info('[COMPREHENSIVE SCRAPER] URL scraped successfully', { 
          url: fullUrl, 
          executionTimeMs,
          headerCount,
          paragraphCount,
          listCount,
          otherCount
        });
        
        // Format the content for better readability
        const formattedContent = [
          `# ${title}`,
          `${description}`,
          '',
          '## Headers',
          ...textContent.headers,
          '',
          '## Contact Information',
          textContent.footer ? `Footer: ${textContent.footer}` : 'No footer information found',
          '',
          '## Main Content',
          ...textContent.paragraphs,
          '',
          '## Lists',
          ...textContent.lists.map((list, i) => {
            return `### List ${i+1} (${list.type}):\n${list.items.map((item, j) => `${list.type === 'ordered' ? j+1 : '•'} ${item}`).join('\n')}`;
          }),
          '',
          '## Additional Content',
          ...textContent.other // Include all additional content
        ].join('\n');
        
        // Trim to max 25,000 characters if needed
        const trimmedContent = formattedContent.length > 25000 
          ? formattedContent.substring(0, 25000) + '\n\n[Content truncated due to length...]' 
          : formattedContent;
        
        // Return full scraped content for the model
        return {
          title,
          description,
          url: fullUrl,
          message: `Scraped content from ${fullUrl}`,
          content: trimmedContent,
          stats: {
            headers: headerCount,
            paragraphs: paragraphCount,
            lists: listCount,
            other: otherCount,
            characterCount: trimmedContent.length,
            wordCount: trimmedContent.split(/\s+/).length
          }
        };
      } catch (error) {
        const executionTimeMs = Math.round(performance.now() - startTime);
        edgeLogger.error('[COMPREHENSIVE SCRAPER] Failed to scrape URL', { 
          url: fullUrl, 
          executionTimeMs,
          error: error instanceof Error ? error.message : String(error)
        });
        
        return {
          title: 'Error',
          description: 'Failed to scrape content',
          url: fullUrl,
          message: `Failed to scrape content from ${fullUrl}: ${error instanceof Error ? error.message : String(error)}`,
          content: `Failed to scrape content from ${fullUrl}. Error: ${error instanceof Error ? error.message : String(error)}`,
          stats: {
            headers: 0,
            paragraphs: 0,
            lists: 0,
            other: 0
          }
        };
      }
    }
  })
};

// Helper function for comprehensive scraping
async function scrapeComprehensively(url: string): Promise<{
  title: string;
  description: string;
  textContent: {
    headers: string[];
    paragraphs: string[];
    lists: { items: string[]; type: 'ordered' | 'unordered' }[];
    footer: string;
    other: string[];
  }
}> {
  const fullUrl = ensureProtocol(url);
  
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
  
  // Capture ALL text on the page
  // First, get all the structured content to maintain organization
  
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
  
  // Extract footer with special attention to contact info
  const footerElements = $('footer, .footer, [role="contentinfo"], #footer, .site-footer');
  let footerText = '';
  footerElements.each((_, el) => {
    footerText += $(el).text().trim().replace(/\s+/g, ' ') + ' ';
  });
  textContent.footer = footerText.trim();
  
  // Look for contact information specifically
  const contactSections = $('[id*="contact"], [class*="contact"], #contact, .contact, .contact-us, .contact-info, [data-id*="contact"]');
  if (contactSections.length) {
    textContent.other.push('CONTACT INFORMATION:');
    contactSections.each((_, section) => {
      textContent.other.push($(section).text().trim().replace(/\s+/g, ' '));
    });
  }
  
  // Look specifically for phone numbers
  const phoneRegex = /(\+?[0-9][-\s\.]?)?(\([0-9]{3}\)[-\s\.]?|[0-9]{3}[-\s\.]?)([0-9]{3}[-\s\.]?[0-9]{4})/g;
  const allText = $('body').text();
  const phoneMatches = allText.match(phoneRegex);
  if (phoneMatches && phoneMatches.length) {
    textContent.other.push('PHONE NUMBERS FOUND:');
    phoneMatches.forEach(phone => {
      textContent.other.push(`Phone: ${phone.trim()}`);
    });
  }
  
  // Now capture ALL text from every element with minimal filtering
  // First, get all elements that have any text content
  const allElements = $('body *');
  const processedText = new Set(); // To avoid exact duplicates
  
  // Create a section specifically for anything that might be missed
  textContent.other.push('ALL TEXT CONTENT:');
  
  allElements.each((_, el) => {
    const $el = $(el);
    
    // Get direct text (text directly in this element, not in children)
    const directText = $el.clone().children().remove().end().text().trim();
    if (directText && directText.length > 0 && !processedText.has(directText)) {
      processedText.add(directText);
      textContent.other.push(directText);
    }
    
    // Also get full text (including children) if it's a container element that might have mixed content
    if (['div', 'section', 'article', 'aside', 'header', 'main', 'nav', 'address'].includes(el.name)) {
      const fullText = $el.text().trim();
      if (fullText && fullText.length > directText.length*1.5) { // Only add if significantly more content than direct text
        const cleanedText = fullText.replace(/\s+/g, ' ').trim();
        if (!processedText.has(cleanedText)) {
          processedText.add(cleanedText);
          textContent.other.push(`[${el.name}]: ${cleanedText}`);
        }
      }
    }
  });
  
  // Get all text nodes that aren't in an element
  const walkTree = (node) => {
    if (node.type === 'text' && node.data.trim()) {
      const text = node.data.trim();
      if (text.length > 0 && !processedText.has(text)) {
        processedText.add(text);
        textContent.other.push(text);
      }
    }
    
    if (node.children) {
      node.children.forEach(walkTree);
    }
  };
  
  walkTree($.root()[0]);
  
  // Look for tables specifically
  $('table').each((_, table) => {
    const tableData = [];
    
    // Get table headers
    const headers = $(table).find('th').map((_, th) => $(th).text().trim()).get();
    if (headers.length) {
      tableData.push(`Table Headers: ${headers.join(' | ')}`);
    }
    
    // Get table rows
    $(table).find('tr').each((rowIndex, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
      if (cells.length) {
        tableData.push(`Row ${rowIndex+1}: ${cells.join(' | ')}`);
      }
    });
    
    if (tableData.length) {
      textContent.other.push(`TABLE DATA:\n${tableData.join('\n')}`);
    }
  });
  
  return { title, description, textContent };
}
