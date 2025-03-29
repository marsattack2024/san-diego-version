# Website Summarizer Documentation

## Overview

The Website Summarizer feature extracts content from photography business websites and generates concise, AI-powered summaries. It's primarily used to enhance the AI system's context about user's photography businesses, enabling more personalized and relevant responses.

## Architecture Components

```
┌────────────────────┐      ┌─────────────────┐      ┌────────────────┐
│                    │      │                 │      │                │
│ Website Summarizer │◄────►│ Web Scraper     │◄────►│ Redis Cache    │
│ Tool               │      │ Tool            │      │                │
│                    │      │                 │      │                │
└────────────────────┘      └─────────────────┘      └────────────────┘
         │                          │                        
         │                          │                        
         ▼                          ▼                        
┌────────────────────┐      ┌─────────────────┐      
│                    │      │                 │      
│ Profile API        │      │ Puppeteer       │      
│ (update-summary)   │      │ Service         │      
│                    │      │                 │      
└────────────────────┘      └─────────────────┘      
```

### Key Components

1. **Website Summarizer Tool** (`/lib/agents/tools/website-summarizer.ts`)
   - Provides the core functionality for generating website summaries
   - Interfaces with the Web Scraper Tool for content extraction
   - Uses the OpenAI API for summarization

2. **Web Scraper Tool** (`/lib/chat-engine/tools/web-scraper.ts`)
   - Extracts content from websites using Puppeteer
   - Interfaces with the Redis cache for storing scraped content

3. **Puppeteer Service** (`/lib/services/puppeteer.service.ts`)
   - Handles low-level web scraping using a serverless Puppeteer implementation
   - Manages URL validation and content extraction

4. **Profile Update API** (`/app/api/profile/update-summary/route.ts`)
   - Endpoint for asynchronously updating user profiles with website summaries
   - Handles the background processing of website summarization

5. **Redis Cache Service** (`/lib/chat-engine/cache-service.ts`)
   - Provides caching for scraped website content to improve performance

## Implementation Details

### Website Summarizer Tool

The core summarizer tool wraps the web scraper functionality and adds summarization:

```typescript
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
  // Process the URL and extract content using the web scraper
  // Generate a summary using AI
  // Return the formatted summary with metadata
}
```

### Integration with User Profiles

The website summarizer is primarily used during the user profile setup process:

1. When a user adds a website URL to their profile, the system saves the profile with a placeholder:
   ```
   Website Summary: [Summary will be generated in background...]
   ```

2. A background process is triggered via the API endpoint `/api/profile/update-summary` that:
   - Takes the website URL and user ID
   - Calls the website summarizer to generate a summary
   - Updates the user's profile with the completed summary

3. The process happens asynchronously so users don't have to wait for scraping and summary generation.

### Summarization Process

1. **Web Scraping**: Content is extracted from the URL using the Puppeteer-based web scraper
2. **Content Processing**: The raw HTML is converted to a readable text format
3. **AI Summarization**: The content is sent to OpenAI with a specialized prompt:
   ```
   You are a professional summarization assistant. Summarize the following website content in approximately ${maxWords} words.
   Focus on the main offerings, value proposition, and key information a photography business owner would find valuable.
   Make the summary clear, informative, and easy to understand. Don't mention that you're summarizing the content.
   ```
4. **Optimization**: The process has configurable parameters for summary length and model selection

### Redis Caching Integration

The Website Summarizer tool benefits from Redis caching through its dependency on the Web Scraper tool:

1. When a website URL is processed, the system first checks if the content exists in the cache
2. Cached content is used when available, significantly improving performance
3. New content is automatically cached for future use with a TTL of 12 hours
4. Cache keys are prefixed with `scrape:` followed by the normalized URL

## Performance Considerations

1. **Timeout Handling**: A 15-second timeout prevents hanging on problematic URLs
2. **Error Handling**: Comprehensive error handling with fallbacks for failed scraping attempts
3. **Logging**: Detailed logging at each step for troubleshooting and performance tracking
4. **Caching**: Redis caching reduces load time for frequently accessed websites

## Example Usage

### In Profile Setup

```typescript
// When user submits profile with a website
async function handleProfileSave(profileData) {
  // Save the profile first with placeholder
  await saveUserProfile({
    ...profileData,
    website_summary: "Website Summary: [Summary will be generated in background...]"
  });

  // Trigger background summary generation
  if (profileData.website_url) {
    fetch('/api/profile/update-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: profileData.website_url, 
        userId: user.id 
      })
    });
  }
}
```

### In AI Context Enhancement

```typescript
// When preparing AI context for a user
function prepareAIContext(user) {
  // Get user profile including website summary
  const profile = await getUserProfile(user.id);
  
  // Add to system prompt
  return `
    ### PHOTOGRAPHY BUSINESS CONTEXT ###
    You are speaking with a photography studio with the following details:
    - Contact: ${profile.full_name}
    - Studio Name: ${profile.company_name}
    - Website: ${profile.website_url}
    - Location: ${profile.location}
    - Description: ${profile.description}
    ${profile.website_summary}

    Please tailor your responses to be relevant to their photography business.
  `;
}
```

## Limitations and Considerations

1. **JavaScript-Heavy Sites**: Some modern websites with heavy JavaScript may not scrape correctly
2. **Large Websites**: Extremely large websites may time out or exceed content limits
3. **Rate Limiting**: The API has built-in rate limiting to prevent abuse
4. **Privacy Considerations**: Only public-facing website content should be summarized

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Usually occur with complex websites
   - Solution: Retry with a different URL or simplify the website structure

2. **Empty Summaries**: Occur when scraping fails to extract meaningful content
   - Solution: Check the website structure and ensure it has textual content

3. **Irrelevant Summaries**: May happen with websites that have diverse content
   - Solution: Use more specific URLs pointing to relevant pages

### Logging and Monitoring

The system includes comprehensive logging at every stage:

```typescript
edgeLogger.info('Website summarization completed', {
  category: LOG_CATEGORIES.TOOLS,
  operation: 'website_summarization_complete',
  url,
  timeTaken,
  summaryLength: summary.length,
  wordCount,
  targetWordCount: maxWords
});
```

These logs can be used for troubleshooting and performance monitoring.

## Future Enhancements

Potential improvements to the website summarizer include:

1. **Multi-page Scraping**: Supporting summarization across multiple pages of a website
2. **Image Analysis**: Incorporating analysis of images on the website for fuller context
3. **Selective Summarization**: Allowing users to specify which parts of their website to focus on
4. **Periodic Updates**: Automatically refreshing summaries for websites that change frequently 