import { z } from 'zod';

/**
 * Schema for the Knowledge Base tool
 * Used for searching the internal knowledge base for relevant information
 */
export const getInformationSchema = z.object({
    query: z.string().describe('The search query to find information about photography business topics')
});

/**
 * Schema for the Web Scraper tool
 * Used for analyzing the content of a URL
 */
export const webScraperSchema = z.object({
    url: z.string().describe('The URL to scrape for content analysis. Must be a valid URL.')
});

/**
 * Schema for the URL Detection tool
 * Used for automatically detecting and processing URLs in text
 */
export const detectAndScrapeUrlsSchema = z.object({
    text: z.string().describe('The text to extract URLs from')
});

/**
 * Schema for storing resources in the knowledge base (legacy support)
 */
export const addResourceSchema = z.object({
    content: z.string().describe('The information to store')
}); 