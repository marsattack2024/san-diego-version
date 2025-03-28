import { z } from 'zod';

/**
 * Schema for the Knowledge Base tool
 * Used for searching the internal knowledge base for relevant information
 */
export const getInformationSchema = z.object({
    query: z.string().describe('The query to search for in the knowledge base. Be specific and include keywords relevant to the photography business context.')
});

/**
 * Schema for the Web Scraper tool
 * Used for analyzing the content of a URL
 */
export const webScraperSchema = z.object({
    url: z.string().describe('The URL to scrape. Must be a valid URL starting with http:// or https://. The URL should be relevant to the user query.')
});

/**
 * Schema for the URL Detection tool
 * Used for automatically detecting and processing URLs in text
 */
export const detectAndScrapeUrlsSchema = z.object({
    text: z.string().describe('The text to scan for URLs. Will detect and scrape all found URLs.')
});

/**
 * Schema for storing resources in the knowledge base (legacy support)
 */
export const addResourceSchema = z.object({
    content: z.string().describe('The resource content to add to the knowledge base')
});

/**
 * Schema for Perplexity search
 * Used for running a search query through Perplexity
 */
export const perplexitySearchSchema = z.object({
    query: z.string().describe('The search query to run through Perplexity. Be specific and include relevant keywords for accurate results.')
});

/**
 * Schema for website summarization
 * Used for summarizing the content of a photography website
 */
export const websiteSummarySchema = z.object({
    url: z.string().describe('The URL of the photography website to summarize'),
    maxWords: z.number().optional().describe('Maximum word count for the summary (default: 600)')
});

/**
 * Schema for URL validation
 * Used for validating the format of a URL
 */
export const validateUrlSchema = z.object({
    url: z.string().describe('URL to validate')
});

/**
 * Schema for multiple URLs
 * Used for processing multiple URLs at once
 */
export const multiUrlSchema = z.object({
    urls: z.array(z.string()).describe('An array of URLs to process')
});

/**
 * Export all tool schemas
 */
export const toolSchemas = {
    getInformationSchema,
    webScraperSchema,
    detectAndScrapeUrlsSchema,
    perplexitySearchSchema,
    websiteSummarySchema,
    validateUrlSchema,
    addResourceSchema,
    multiUrlSchema,
}; 