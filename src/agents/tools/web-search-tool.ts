import { z } from 'zod';
import { createBasicTool } from '../core/agent-tools';
import { createLogger } from '../../utils/client-logger';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractUrls } from './web-scraper-tool';

const logger = createLogger('agent:tools:web-search');

// Define types for search results
interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

/**
 * Simple web search tool
 * Performs a search and returns the top results
 */
export const webSearchTool = createBasicTool(
  'webSearch',
  'Performs a web search and returns the top results with snippets.',
  z.object({
    query: z.string().describe('The search query to find information about.'),
  }),
  async ({ query }) => {
    const startTime = performance.now();
    
    try {
      logger.debug('Performing web search', { query });
      
      // This is a simplified implementation
      // In a production environment, you would use a proper search API
      // such as Google Custom Search API, Bing Search API, or similar
      
      // For now, we'll use a simple approach by searching and scraping results
      // This is not recommended for production use
      
      // Format the query for URL
      const formattedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.google.com/search?q=${formattedQuery}`;
      
      // Make the request
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 10000, // 10 second timeout
      });
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      // Extract search results
      const results: SearchResult[] = [];
      
      // Extract result links and snippets
      $('div.g').each((i, element) => {
        if (i >= 5) return; // Limit to top 5 results
        
        const titleElement = $(element).find('h3').first();
        const title = titleElement.text().trim();
        
        const linkElement = $(element).find('a').first();
        const link = linkElement.attr('href');
        
        const snippetElement = $(element).find('div.VwiC3b').first();
        const snippet = snippetElement.text().trim();
        
        if (title && link && snippet) {
          results.push({
            title,
            link,
            snippet
          });
        }
      });
      
      // Extract URLs from the results for potential scraping
      const urls = results.map(result => result.link).filter(Boolean);
      
      const endTime = performance.now();
      logger.info('Web search completed', {
        query,
        resultCount: results.length,
        executionTimeMs: Math.round(endTime - startTime)
      });
      
      return {
        success: true,
        message: `Found ${results.length} results for "${query}"`,
        results,
        urls
      };
      
    } catch (error) {
      const endTime = performance.now();
      logger.error('Error performing web search', {
        query,
        error,
        executionTimeMs: Math.round(endTime - startTime)
      });
      
      return {
        error: true,
        message: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
        results: [] as SearchResult[]
      };
    }
  }
);

/**
 * Combined search tool that uses both web search and deep search
 * This tool orchestrates both search methods and combines the results
 */
export const combinedSearchTool = createBasicTool(
  'combinedSearch',
  'Performs both a web search and a deep search, combining the results for comprehensive information.',
  z.object({
    query: z.string().describe('The search query to find information about.'),
  }),
  async ({ query }) => {
    const startTime = performance.now();
    logger.debug('Starting combined search', { query });
    
    try {
      // Run both searches in parallel
      const [webSearchResult, deepSearchResult] = await Promise.allSettled([
        webSearchTool.execute({ query }),
        // Import dynamically to avoid circular dependencies
        import('./deep-search-tool').then(module => 
          module.deepSearchTool.execute({ query })
        )
      ]);
      
      // Process web search results
      const webResults = webSearchResult.status === 'fulfilled' 
        ? webSearchResult.value 
        : { error: true, message: 'Web search failed', results: [] as SearchResult[] };
      
      // Process deep search results
      const deepResults = deepSearchResult.status === 'fulfilled'
        ? deepSearchResult.value
        : { error: true, message: 'Deep search failed', content: '' };
      
      const endTime = performance.now();
      logger.info('Combined search completed', {
        query,
        webSearchSuccess: webSearchResult.status === 'fulfilled',
        deepSearchSuccess: deepSearchResult.status === 'fulfilled',
        executionTimeMs: Math.round(endTime - startTime)
      });
      
      return {
        webSearch: webResults,
        deepSearch: deepResults,
        combinedSummary: `Combined search results for "${query}". Web search ${webSearchResult.status === 'fulfilled' ? 'succeeded' : 'failed'}. Deep search ${deepSearchResult.status === 'fulfilled' ? 'succeeded' : 'failed'}.`
      };
      
    } catch (error) {
      const endTime = performance.now();
      logger.error('Error in combined search', {
        query,
        error,
        executionTimeMs: Math.round(endTime - startTime)
      });
      
      return {
        error: true,
        message: `Combined search failed: ${error instanceof Error ? error.message : String(error)}`,
        webSearch: { error: true, results: [] as SearchResult[] },
        deepSearch: { error: true, content: '' }
      };
    }
  }
); 