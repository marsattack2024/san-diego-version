/**
 * Website Summarizer Tool
 * Scrapes a website and generates a summary using AI
 * Uses the web scraper tool for content extraction
 */

import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { scrapeWebContentTool } from '@/lib/tools/web-scraper.tool';
import { ensureProtocol } from '@/lib/utils/url-utils';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

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
  let title = 'Unknown Title';

  try {
    // Process the URL to ensure it has protocol
    const fullUrl = ensureProtocol(url);

    edgeLogger.info('Starting website summarization', {
      category: LOG_CATEGORIES.TOOLS,
      operation: 'website_summarization_start',
      url: fullUrl,
      maxWords: options.maxWords
    });

    // Set up a timeout for the scraping operation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAX_DURATION_MS);

    try {
      // Use the web scraper tool to get the content
      const toolCallId = `summarizer-${Date.now()}`;

      // Execute the web scraper tool
      const scraperResult = await scrapeWebContentTool.execute(
        { url: fullUrl },
        {
          messages: [{ role: 'user', content: `Scrape this URL: ${fullUrl}` }],
          toolCallId: toolCallId
        }
      );

      clearTimeout(timeoutId);

      if (!scraperResult || scraperResult === '') {
        throw new Error('Failed to retrieve content from URL');
      }

      // Try to extract title from the scraped content (typically in a heading)
      const titleMatch = scraperResult.match(/## ([^✓✗]+)/);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }

      // Log successful scraping
      edgeLogger.info('Website scraped successfully for summary', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'website_summarization_scraped',
        url: fullUrl,
        contentLength: scraperResult.length,
        title,
        timeTaken: Math.round(performance.now() - startTime)
      });

      // Generate the summary
      const summary = await generateSummary(
        scraperResult,
        title,
        fullUrl,
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
      category: LOG_CATEGORIES.TOOLS,
      operation: 'website_summarization_error',
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
      category: LOG_CATEGORIES.TOOLS,
      operation: 'website_summarization_gen_start',
      contentLength: content.length,
      targetWordCount: maxWords
    });

    const prompt = `You are a professional summarization assistant. Summarize the following website content in approximately ${maxWords} words.
      Focus on the main offerings, value proposition, and key information a photography business owner would find valuable.
      Make the summary clear, informative, and easy to understand. Don't mention that you're summarizing the content.
      
      Website: ${title} (${url})
      
      Content:
      ${content}
      
      Summary (approximately ${maxWords} words):`;

    const completion = await generateText({
      model: openai('gpt-3.5-turbo'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 800,
    });

    const summary = completion.text.trim();
    const wordCount = countWords(summary);
    const timeTaken = Math.round(performance.now() - startTime);

    edgeLogger.info('Summary generation completed', {
      category: LOG_CATEGORIES.TOOLS,
      operation: 'website_summarization_complete',
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
      category: LOG_CATEGORIES.TOOLS,
      operation: 'website_summarization_gen_error',
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