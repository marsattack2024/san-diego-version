'use server';

export const maxDuration = 60; // Maximum allowed duration for Hobby plan (60 seconds)

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
    // Truncate content for faster processing - increased to 25,000 characters
    const truncatedContent = content.substring(0, 25000);
    const truncated = truncatedContent.length < content.length;
    
    logger.info('Preparing content for summarization', {
      url,
      contentLength: content.length,
      truncatedLength: truncatedContent.length,
      operation
    });

    // Enhanced prompt for more structured, comprehensive summary with testimonials
    const systemPrompt = "You are a professional content researcher for photography businesses. Your task is to extract and organize key business information into a structured, comprehensive and verbose writeup. You MUST use the FULL word count allowed (no less than 90% of the maximum) to provide maximum detail and value. Pay special attention to finding and including actual client testimonials with attribution.";
    const userPrompt = `
Extract and summarize the key features, benefits, and unique selling propositions (USPs) from the following photography business website content using EXACTLY ${maxWords} words. You MUST use at least 90% of the word count to create a comprehensive report.

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
10. IMPORTANT: Find and include 3-5 DIRECT QUOTES from client testimonials with the client's name/attribution

Format your summary into these clear sections:
- Overview (3-4 sentences capturing the essence of the photography business)
- Core Offerings (detailed bullet points of main photography services)
- Pricing & Packages (summary of pricing structure and what's included)
- The Photography Experience (detailed description of the client journey from booking to delivery)
- Key Benefits & Differentiators (what sets them apart from other photographers)
- Guarantees & Policies (any satisfaction guarantees or special policies)
- Credentials & Social Proof (experience, awards)
- Client Testimonials (include 3-5 direct quotes with attribution - "Name, Service Type")
- Booking Process (how to get started, what to expect)
- Contact Information (how to reach them, response times)
- Call to Action (what they want visitors to do)
- Additional Information (any other relevant information)

Website information:
Title: ${title}
URL: ${url}
Content:
${truncatedContent}${truncated ? ' ... (content truncated for brevity)' : ''}

Keep the language comprehensive, benefit-focused, and persuasive while maintaining the brand's voice. Avoid generic descriptions and focus on specific, compelling aspects that would motivate potential photography clients.

IMPORTANT INSTRUCTIONS:
1. You MUST use at least 90% of the ${maxWords} word limit (no less than ${Math.floor(maxWords * 0.9)} words)
2. Include 3-5 DIRECT QUOTES from client testimonials with attribution whenever possible
3. If exact testimonials aren't available, note this briefly and expand other sections
4. Format testimonials as: "Quote text." - Client Name, Service Type
5. Use bullet points for services, benefits, and packages to improve readability
6. Include specific details rather than generic descriptions

Your goal is to create a comprehensive, persuasive report that captures the unique value of this photography business with specific details and social proof.
`;

    // Generate the summary using a more capable model for better analysis
    const { text: aiSummary } = await generateText({
      model: openai('gpt-4o-mini'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 1800, // Further increased to ensure full word count with testimonials
    });
    
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
      summaryTimeMs: summaryTime,
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