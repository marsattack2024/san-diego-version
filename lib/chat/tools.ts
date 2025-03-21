import { tool } from 'ai';
import { z } from 'zod';
import { findSimilarDocumentsOptimized } from '../vector/documentRetrieval';
import { createResource } from '../actions/resources';
import { edgeLogger } from '../logger/edge-logger';
import { extractUrls, ensureProtocol } from './url-utils';
import type { RetrievedDocument } from '../../types/vector/vector';
import { callPerplexityAPI } from '../agents/tools/perplexity/api';
import type { CheerioAPI } from 'cheerio';

// Define interfaces for scraped content
interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
}

// Stats interface for scraper metrics
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
    description: 'Search the internal knowledge base for relevant information',
    parameters: z.object({
      query: z.string().describe('the question to search for')
    }),
    execute: async ({ query }): Promise<string> => {
      try {
        const { documents, metrics } = await findSimilarDocumentsOptimized(query, {
          limit: 5, // Changed back to 5 from 10
          similarityThreshold: 0.65
        });
        
        if (!documents || documents.length === 0) {
          return "No relevant information found in the knowledge base.";
        }

        // Only use the top 3 most relevant documents for the agent
        const topDocuments = documents.slice(0, 3);
        
        // Format the results with more detail including IDs and similarity scores
        const formattedResults = topDocuments.map((doc: RetrievedDocument, index: number) => {
          const similarityPercent = Math.round(doc.similarity * 100);
          // Safely handle ID - ensure it's a string
          const idString = typeof doc.id === 'string' ? doc.id : String(doc.id);
          const idPreview = idString.length > 8 ? idString.substring(0, 8) : idString;
          
          // Format content with proper line breaks
          const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
          // Replace any existing line breaks with proper formatting
          const formattedContent = content
            .split(/\r?\n/)
            .filter(line => line.trim() !== '')
            .map(line => `    ${line.trim()}`)
            .join('\n');
          
          return `Document #${index + 1} [ID: ${idPreview}] (${similarityPercent}% relevant):\n${formattedContent}\n`;
        }).join('\n-------------------------------------------\n\n');

        // Add aggregate metrics
        const avgSimilarity = Math.round(
          topDocuments.reduce((sum, doc) => sum + doc.similarity, 0) / topDocuments.length * 100
        );

        return `Found ${topDocuments.length} most relevant documents (out of ${documents.length} retrieved, average similarity of top 3: ${avgSimilarity}%):\n\n${formattedResults}`;
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

  // Note: Deep Search is now exclusively a pre-processing step controlled by UI toggle
  // The deepSearch tool has been removed to prevent the AI from calling it directly

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
        // Use the comprehensive scraper for better content extraction
        const scrapedContent = await chatTools.comprehensiveScraper.execute!({ url: firstUrl }, { 
          toolCallId: 'internal-url-scraper-call',
          messages: []
        });
        
        return {
          message: `Detected ${urls.length} URL(s). Scraped content from ${firstUrl}`,
          urls: [
            {
              url: firstUrl,
              title: scrapedContent.title,
              content: `Comprehensive content scraped from ${firstUrl}`
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
    description: 'Extract content from a webpage, including headers, paragraphs, and other structured content',
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
        
        // No truncation - use the full content
        const trimmedContent = formattedContent;
        
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
  // Dynamically import axios and cheerio only when needed
  const axios = (await import('axios')).default;
  const cheerioModule = await import('cheerio');
  
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
    maxContentLength: 20 * 1024 * 1024, // Increased to 20MB max content size
  });
  
  const html = response.data;
  const $: CheerioAPI = cheerioModule.load(html);
  
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
  $('h1, h2, h3, h4, h5, h6').each((index: number, el) => {
    const text = $(el).text().trim();
    if (text) textContent.headers.push(`${el.name.toUpperCase()}: ${text}`);
  });
  
  // Extract paragraphs - include more text-containing elements
  $('p, div > p, article > p, section > p, main > p, .content p, [class*="content"] p, [class*="text"] p, [class*="body"] p').each((index: number, el) => {
    const text = $(el).text().trim();
    if (text) textContent.paragraphs.push(text);
  });
  
  // Extract lists (ul, ol)
  $('ul, ol, div > ul, div > ol, article > ul, article > ol, section > ul, section > ol, .content ul, .content ol').each((index: number, el) => {
    const items = $(el)
      .find('li')
      .map((liIndex: number, li) => $(li).text().trim())
      .get()
      .filter((text: string) => text);
    
    if (items.length) {
      textContent.lists.push({
        items,
        type: $(el).is('ol') ? 'ordered' : 'unordered',
      });
    }
  });
  
  // Extract footer with special attention to contact info
  const footerElements = $('footer, .footer, [role="contentinfo"], #footer, .site-footer, [class*="footer"], [id*="footer"]');
  let footerText = '';
  footerElements.each((_, el) => {
    footerText += $(el).text().trim().replace(/\s+/g, ' ') + ' ';
  });
  textContent.footer = footerText.trim();
  
  // Look for contact information specifically
  const contactSections = $('[id*="contact"], [class*="contact"], #contact, .contact, .contact-us, .contact-info, [data-id*="contact"], [href*="contact"], [href*="mailto"], [href*="tel"]');
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
  
  // Capture text from common content containers
  $('article, section, .content, [class*="content"], [class*="main"], main, [role="main"], [class*="body"], [id*="content"], [id*="main"]').each((_, container) => {
    const containerText = $(container).text().trim().replace(/\s+/g, ' ');
    if (containerText && containerText.length > 50) { // Only add substantial content
      textContent.other.push(`CONTENT SECTION: ${containerText}`);
    }
  });
  
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
    if (['div', 'section', 'article', 'aside', 'header', 'main', 'nav', 'address', 'span', 'label', 'a', 'button', 'form'].includes(el.name)) {
      const fullText = $el.text().trim();
      // Capture more content by lowering the threshold for what's considered "significant"
      if (fullText && fullText.length > directText.length*1.2) { // Reduced threshold to capture more content
        const cleanedText = fullText.replace(/\s+/g, ' ').trim();
        if (!processedText.has(cleanedText)) {
          processedText.add(cleanedText);
          textContent.other.push(`[${el.name}]: ${cleanedText}`);
        }
      }
    }
  });
  
  // Get all text nodes that aren't in an element
  const walkTree = (node: any) => {
    // Process text nodes
    if (node.type === 'text' && node.data && typeof node.data.trim === 'function') {
      const text = node.data.trim();
      if (text.length > 0 && !processedText.has(text)) {
        processedText.add(text);
        textContent.other.push(text);
      }
    }
    
    // Process CDATA sections which might contain text
    if (node.type === 'cdata' && node.data && typeof node.data.trim === 'function') {
      const text = node.data.trim();
      if (text.length > 0 && !processedText.has(text)) {
        processedText.add(text);
        textContent.other.push(`[CDATA]: ${text}`);
      }
    }
    
    // Process comment nodes which might contain important information
    if (node.type === 'comment' && node.data && typeof node.data.trim === 'function') {
      const text = node.data.trim();
      // Only include comments that might contain useful information (longer than 10 chars)
      if (text.length > 10 && !processedText.has(text)) {
        processedText.add(text);
        textContent.other.push(`[COMMENT]: ${text}`);
      }
    }
    
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
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
  
  // Look for forms and input fields which might contain important information
  $('form').each((formIndex, form) => {
    const formData = [`FORM ${formIndex+1}:`];
    
    // Get form labels and inputs
    $(form).find('label, input[type="text"], input[type="email"], input[type="tel"], textarea, select').each((_, el) => {
      const text = $(el).text().trim() || $(el).attr('placeholder') || $(el).attr('name') || $(el).attr('id');
      if (text) {
        formData.push(`${el.name}: ${text}`);
      }
    });
    
    if (formData.length > 1) { // If we found any form elements
      textContent.other.push(formData.join('\n'));
    }
  });
  
  // Look for meta tags with important information
  $('meta[name], meta[property]').each((_, meta) => {
    const name = $(meta).attr('name') || $(meta).attr('property');
    const content = $(meta).attr('content');
    
    if (name && content && !name.includes('viewport') && !name.includes('charset')) {
      textContent.other.push(`META: ${name} = ${content}`);
    }
  });
  
  return { title, description, textContent };
}
