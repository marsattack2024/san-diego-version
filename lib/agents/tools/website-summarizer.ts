'use server';

import { myProvider } from '@/lib/ai/providers';
import { logger } from '@/lib/logger';
import { chatTools } from '@/lib/chat/tools';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Scrapes a website and generates a concise summary using AI
 * @param url The website URL to scrape and summarize
 * @param maxWords Maximum word count for the summary (default: 200)
 * @param userId Optional user ID for logging purposes only
 * @returns A summary of the website content with prefix "Website Summary: "
 */
export async function generateWebsiteSummary(
  url: string, 
  maxWords: number = 200,
  userId?: string
): Promise<string> {
  const operation = 'website_summary';
  const startTime = Date.now();
  
  try {
    if (!url || !url.startsWith('http')) {
      logger.warn('Invalid URL provided for website summarization', { 
        url, 
        operation 
      });
      return '';
    }

    logger.info('Starting website summarization process', { 
      url, 
      maxWords,
      operation,
      userId: userId || 'anonymous'
    });

    // Step 1: Scrape the website using the existing tool
    const scrapeStartTime = Date.now();
    const scrapeResult = await chatTools.comprehensiveScraper.execute({ url }, {
      toolCallId: `website-summary-scrape-${Date.now()}`,
      messages: []
    });

    const scrapeTime = Date.now() - scrapeStartTime;
    
    if (!scrapeResult || !scrapeResult.content) {
      logger.warn('Failed to scrape website content', { url, operation });
      return 'Website Summary: [Error: Failed to scrape website content]';
    }
    
    logger.info('Website scraped successfully', { 
      url, 
      contentLength: scrapeResult.content.length,
      title: scrapeResult.title || 'No title',
      scrapeTimeMs: scrapeTime,
      operation
    });

    // Step 2: Generate the summary
    const summary = await generateSummary(
      scrapeResult.content,
      scrapeResult.title || 'Unknown',
      url,
      maxWords,
      startTime
    );
    
    return summary;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error in website summarization process', { 
      url, 
      error: errorMessage,
      operation,
      totalTimeMs: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
    return 'Website Summary: [Error generating summary]';
  }
}

/**
 * Generates a summary of website content using AI
 * @param content The scraped content
 * @param title The website title
 * @param url The website URL
 * @param maxWords Maximum word count for summary
 * @param processStartTime Start time of the entire process for timing
 * @returns The generated summary with "Website Summary: " prefix
 */
async function generateSummary(
  content: string,
  title: string,
  url: string,
  maxWords: number,
  processStartTime: number = Date.now()
): Promise<string> {
  const operation = 'website_summary';
  const summaryStartTime = Date.now();
  
  try {
    // Truncate content for faster processing
    const truncatedContent = content.substring(0, 10000);
    const truncated = truncatedContent.length < content.length;
    
    logger.info('Preparing content for summarization', {
      url,
      contentLength: content.length,
      truncatedLength: truncatedContent.length,
      operation
    });

    // Prepare the prompt for the AI summary
    const systemPrompt = "You are a professional content summarizer for photography businesses.";
    const userPrompt = `
Create a clear, concise summary of this photography business website in under ${maxWords} words.
Focus ONLY on these key aspects:
- Type of photography (weddings, portraits, etc.)
- Style and approach
- Specializations and unique selling points
- Geographic service areas
- Target clientele
- Special packages or services

Website information:
Title: ${title}
URL: ${url}
Content:
${truncatedContent}${truncated ? ' ... (content truncated for brevity)' : ''}

Write in third person perspective. Be factual and objective with NO promotional language.
IMPORTANT: Keep the summary under ${maxWords} words. Be concise.
`;

    // Generate the summary using a faster model for better performance
    const { text: aiSummary } = await generateText({
      model: openai('gpt-4o-mini'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 250, // Tighter limit for faster generation
    });
    
    const summaryTime = Date.now() - summaryStartTime;
    const wordCount = aiSummary.split(/\s+/).filter(Boolean).length;
    
    // Format the summary with a consistent prefix
    const formattedSummary = `Website Summary: ${aiSummary}`;
    
    logger.info('Summary generated successfully', { 
      url, 
      wordCount,
      summaryLength: formattedSummary.length,
      summaryTimeMs: summaryTime,
      operation
    });

    logger.info('Website summarization process completed', {
      url,
      totalProcessingTimeMs: Date.now() - processStartTime,
      operation
    });

    return formattedSummary;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Error generating website summary', { 
      url, 
      error: errorMessage,
      operation,
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
    
    return `Website Summary: [Error summarizing ${url}]`;
  }
}