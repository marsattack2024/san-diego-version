import { myProvider } from '@/lib/ai/providers';
import { logger } from '@/lib/logger';
import { chatTools } from '@/lib/chat/tools';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 60; // Maximum allowed duration for Hobby plan (60 seconds)

/**
 * Scrapes a website and generates a concise summary using AI
 * @param url The website URL to scrape and summarize
 * @param maxWords Maximum word count for the summary (default: 200)
 * @param userId Optional user ID for logging purposes only
 * @returns A summary of the website content with prefix "Website Summary: "
 */
export async function generateWebsiteSummary(
  url: string, 
  maxWords: number = 600,
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
    const scrapeResult = await chatTools.webScraper.execute({ url }, {
      toolCallId: 'internal-website-summarizer',
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
    
    // Log total processing time
    const totalTime = Date.now() - startTime;
    logger.info('Total website summarization process completed', {
      url,
      totalProcessingTimeMs: totalTime,
      operation
    });
    
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
    // Truncate content for faster processing - using 25,000 characters as requested
    const truncatedContent = content.substring(0, 25000);
    const truncated = truncatedContent.length < content.length;
    
    logger.info('Preparing content for summarization', {
      url,
      contentLength: content.length,
      truncatedLength: truncatedContent.length,
      truncationPercentage: Math.round((truncatedContent.length / content.length) * 100),
      operation
    });

    // Enhanced prompt for more structured, comprehensive summary with testimonials
    const systemPrompt = "You are a professional content researcher for photography businesses. Your task is to extract and organize key business information into a structured, comprehensive writeup. Focus on extracting the most important information efficiently.";
    const userPrompt = `
Extract and summarize the key features, benefits, and unique selling propositions (USPs) from the following photography business website content using EXACTLY ${maxWords} words.

Focus on extracting these specific details:
1. The primary value proposition and what makes this photography business unique
2. Key features of their photography services and how they directly benefit customers
3. The specific problems they solve for their target audience
4. Pricing information, packages, and any special offers available
5. Guarantees, satisfaction policies, or risk-reversals they offer
6. Their credentials, experience, awards, or other trust factors
7. The emotional and practical transformation clients can expect
8. The booking process and what clients can expect at each stage
9. Contact information and call-to-action details
10. IMPORTANT: Find and include 2-3 DIRECT QUOTES from client testimonials with the client's name/attribution

Format your summary into these clear sections:
- Overview (2-3 sentences capturing the essence of the photography business)
- Core Offerings (bullet points of main photography services)
- Pricing & Packages (summary of pricing structure)
- Key Benefits & Differentiators (what sets them apart)
- Client Testimonials (include direct quotes with attribution)
- Booking Process & Contact Information (how to get started)

Website information:
Title: ${title}
URL: ${url}
Content:
${truncatedContent}${truncated ? ' ... (content truncated for brevity)' : ''}

Keep the language benefit-focused and persuasive while maintaining the brand's voice.
`;

    // Log prompt preparation time
    const promptPrepTime = Date.now() - summaryStartTime;
    logger.info('Prompt preparation completed', {
      url,
      promptPrepTimeMs: promptPrepTime,
      operation
    });

    // Generate the summary using a faster model for better performance
    const aiStartTime = Date.now();
    const { text: aiSummary } = await generateText({
      model: openai('gpt-3.5-turbo'), // Using a faster model for better performance
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 1500, // Adjusted for the faster model
    });
    
    const aiProcessingTime = Date.now() - aiStartTime;
    const summaryTime = Date.now() - summaryStartTime;
    const wordCount = aiSummary.split(/\s+/).filter(Boolean).length;
    
    // Format the summary with a consistent prefix
    const formattedSummary = `Website Summary: ${aiSummary}`;
    
    // Log word count percentage of target
    const wordCountPercentage = Math.floor((wordCount / maxWords) * 100);
    
    logger.info('Summary generated successfully', { 
      url, 
      wordCount,
      wordCountPercentage: `${wordCountPercentage}% of target`,
      summaryLength: formattedSummary.length,
      aiProcessingTimeMs: aiProcessingTime,
      totalSummaryTimeMs: summaryTime,
      operation
    });

    // If word count is significantly below target, log a warning
    if (wordCount < maxWords * 0.85) {
      logger.warn('Summary word count below 85% of target', {
        url,
        targetWords: maxWords,
        actualWords: wordCount,
        percentOfTarget: wordCountPercentage
      });
    }

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