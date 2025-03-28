/**
 * Website Summarizer Tool
 * Scrapes a website and generates a summary using AI
 * Uses the Puppeteer scraper directly rather than using the existing tool
 */

import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { formatScrapedContent } from '@/lib/chat/tools';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Max duration setting for Hobby plan
const MAX_DURATION_MS = 15000;

// Schema for website summarization
export const websiteSummarySchema = z.object({
  url: z.string().describe('The URL of the website to summarize'),
  maxWords: z.number().optional().describe('Maximum word count for the summary (default: 600)')
});

/**
 * Generate a summary of a website
 * @param url The URL to summarize
 * @param options Optional parameters like maximum word count
 * @returns The summary of the website
 */
export async function generateWebsiteSummary(
  url: string,
  options: {
    maxWords?: number;
  } = {}
): Promise<{
  summary: string;
  url: string;
  title: string;
  timeTaken: number;
  wordCount: number;
  error?: string;
}> {
  const startTime = performance.now();
  let title = '';

  try {
    // Validate the URL
    // We'll import these dynamically to avoid increasing the edge bundle size
    const { validateAndSanitizeUrl } = await import('./web-scraper-tool');
    const { ensureProtocol } = await import('@/lib/chat/url-utils');

    // Process the URL to ensure it has protocol and validate it
    const fullUrl = ensureProtocol(url);
    let validUrl: string;

    try {
      validUrl = validateAndSanitizeUrl(fullUrl);
    } catch (error) {
      edgeLogger.warn('Invalid URL for summarization', {
        url: fullUrl,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        summary: `The URL ${url} appears to be invalid or unsafe. Please provide a valid website URL.`,
        url: url,
        title: 'Invalid URL',
        timeTaken: Math.round(performance.now() - startTime),
        wordCount: 0,
        error: 'Invalid URL'
      };
    }

    edgeLogger.info('Starting website summarization', {
      url: validUrl,
      maxWords: options.maxWords
    });

    // Call the Puppeteer scraper directly
    const { callPuppeteerScraper } = await import('./web-scraper-tool');

    // Set up a timeout for the scraping operation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAX_DURATION_MS);

    try {
      // Perform the scraping
      const scraperResult = await callPuppeteerScraper(validUrl);
      clearTimeout(timeoutId);

      // Check if the result is valid
      if (!scraperResult || typeof scraperResult !== 'object') {
        throw new Error('Invalid scraper result');
      }

      // Extract content and title from the result
      const content = scraperResult.content || '';
      title = scraperResult.title || 'Unknown Title';

      // Log successful scraping
      edgeLogger.info('Website scraped successfully for summary', {
        url: validUrl,
        contentLength: content.length,
        title,
        timeTaken: Math.round(performance.now() - startTime)
      });

      // Format the content for the AI
      const formattedContent = formatScrapedContent(scraperResult);

      // Generate the summary
      const summary = await generateSummary(
        formattedContent,
        title,
        validUrl,
        options.maxWords || 600,
        startTime
      );

      return summary;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const timeTaken = Math.round(performance.now() - startTime);

    edgeLogger.error('Website summarization failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
      timeTaken
    });

    return {
      summary: `Sorry, I encountered an error while trying to summarize the website at ${url}. ${error instanceof Error ? error.message : String(error)}`,
      url,
      title: title || 'Error',
      timeTaken,
      wordCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Generate a summary using AI
 */
async function generateSummary(
  content: string,
  title: string,
  url: string,
  maxWords: number,
  startTime: number
): Promise<{
  summary: string;
  url: string;
  title: string;
  timeTaken: number;
  wordCount: number;
}> {
  try {
    edgeLogger.info('Starting summary generation', {
      contentLength: content.length,
      targetWordCount: maxWords
    });

    // Prepare the prompt for the AI
    const prompt = `You are a professional summarization assistant. Summarize the following website content in approximately ${maxWords} words.
      Focus on the main offerings, value proposition, and key information a photography business owner would find valuable.
      Make the summary clear, informative, and easy to understand. Don't mention that you're summarizing the content.
      
      Website: ${title} (${url})
      
      Content:
      ${content}
      
      Summary (approximately ${maxWords} words):`;

    // Generate the summary using AI SDK directly
    const completion = await generateText({
      model: openai('gpt-3.5-turbo'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 800,
    });

    // Get the summary text
    const summary = completion.text.trim();

    // Calculate word count
    const wordCount = countWords(summary);

    // Log results
    const timeTaken = Math.round(performance.now() - startTime);
    edgeLogger.info('Summary generation completed', {
      url,
      timeTaken,
      summaryLength: summary.length,
      wordCount,
      targetWordCount: maxWords
    });

    return {
      summary,
      url,
      title,
      timeTaken,
      wordCount
    };
  } catch (error) {
    edgeLogger.error('Summary generation failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }
}

/**
 * Count words in a string
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}