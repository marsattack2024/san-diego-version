// Import environment variables first - this must be the first import
import '../lib/env-loader';

import { runTest, runTests } from '../lib/test-utils';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { edgeLogger } from '../../lib/logger/edge-logger';

// Test URLs
const TEST_URLS = [
  'https://www.example.com',
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  'https://nodejs.org/en/docs/'
];

/**
 * Scrape content from a URL
 * @param url The URL to scrape
 * @returns Object containing title, description, and content
 */
async function scrapeUrl(url: string): Promise<{
  title: string;
  description: string;
  content: string;
  url: string;
}> {
  try {
    console.log(`Scraping URL: ${url}`);
    const startTime = performance.now();
    
    // Fetch the HTML content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 10000, // 10 second timeout
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract title
    const title = $('title').text().trim() || 'No title found';
    
    // Extract meta description
    const description = $('meta[name="description"]').attr('content') || 
                        $('meta[property="og:description"]').attr('content') || 
                        'No description found';
    
    // Extract main content (this is a simplified approach)
    // In a real-world scenario, you'd want more sophisticated content extraction
    let content = '';
    
    // Try to find main content container
    const mainContent = $('main, article, #content, .content, #main, .main').first();
    
    if (mainContent.length > 0) {
      // If a main content container is found, use it
      content = mainContent.text().trim();
    } else {
      // Otherwise, extract text from paragraphs
      $('p').each((_, element) => {
        const paragraphText = $(element).text().trim();
        if (paragraphText.length > 50) { // Only include substantial paragraphs
          content += paragraphText + '\n\n';
        }
      });
    }
    
    // Clean up the content
    content = content
      .replace(/\s+/g, ' ')
      .trim() || 'No content extracted';
    
    const endTime = performance.now();
    const executionTime = Math.round(endTime - startTime);
    
    console.log(`Scraping completed in ${executionTime}ms`);
    console.log(`Title: ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`);
    console.log(`Description: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`);
    console.log(`Content length: ${content.length} characters`);
    
    return {
      title,
      description,
      content,
      url
    };
  } catch (error: any) {
    edgeLogger.error('Error scraping URL', {
      url,
      error: error.message,
      stack: error.stack
    });
    
    // Return empty data with the URL
    return {
      title: 'Error',
      description: `Failed to scrape: ${error.message}`,
      content: '',
      url
    };
  }
}

/**
 * Test the scraper with a single URL
 */
async function testSingleUrlScraper(): Promise<void> {
  const url = TEST_URLS[0];
  console.log(`\n=== Testing Single URL Scraper ===`);
  console.log(`Target URL: ${url}`);
  
  try {
    const result = await scrapeUrl(url);
    
    console.log('\n=== Scraping Result ===');
    console.log('Title:', result.title);
    console.log('Description:', result.description);
    console.log('Content preview:', result.content.substring(0, 150) + '...');
    console.log('Content length:', result.content.length, 'characters');
    
  } catch (error: any) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

/**
 * Test the scraper with multiple URLs
 */
async function testMultipleUrlScraper(): Promise<void> {
  console.log(`\n=== Testing Multiple URL Scraper ===`);
  console.log(`Target URLs: ${TEST_URLS.slice(1).join(', ')}`);
  
  try {
    const results = await Promise.all(
      TEST_URLS.slice(1).map(url => scrapeUrl(url))
    );
    
    console.log('\n=== Scraping Results ===');
    results.forEach((result, index) => {
      console.log(`\n[Result ${index + 1}] ${result.url}`);
      console.log('Title:', result.title);
      console.log('Description:', result.description);
      console.log('Content length:', result.content.length, 'characters');
    });
    
  } catch (error: any) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

/**
 * Main function to run all scraper tests
 */
async function main(): Promise<void> {
  await runTests([
    { name: 'Single URL Scraper', fn: testSingleUrlScraper },
    { name: 'Multiple URL Scraper', fn: testMultipleUrlScraper }
  ]);
}

// Run the tests if this module is being executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

// Export the tests for use in other test runners
export const tests = [
  { name: 'Single URL Scraper', fn: testSingleUrlScraper },
  { name: 'Multiple URL Scraper', fn: testMultipleUrlScraper }
]; 