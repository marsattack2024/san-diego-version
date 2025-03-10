# Perplexity DeepSearch Integration Guide

This document explains how the Perplexity DeepSearch feature is implemented in the application, including key files, configuration, prompting strategy, and how results are processed.

## Overview

Perplexity DeepSearch provides advanced web search capabilities through the Perplexity API. It's used to enrich the AI's responses with up-to-date information from the web, significantly improving the quality and relevance of answers to user queries.

## Key Components

### 1. Configuration and Setup

The DeepSearch feature requires a valid Perplexity API key configured in the environment:

```
PERPLEXITY_API_KEY=your-perplexity-api-key
```

### 2. Key Files

| File | Purpose |
|------|---------|
| `/lib/chat/tools.ts` | Defines the DeepSearch tool implementation |
| `/app/api/chat/route.ts` | Manages when and how DeepSearch is triggered |
| `/app/api/events/route.ts` | Handles server-sent events for DeepSearch status |
| `/components/deep-search-tracker.tsx` | Client component for tracking DeepSearch progress |
| `/stores/chat-store.ts` | Manages DeepSearch state |
| `/components/messages.tsx` | Displays "Thinking & searching..." indicator |

### 3. How DeepSearch is Triggered

DeepSearch is triggered when:
1. The user has enabled DeepSearch (toggle in the UI)
2. A user submits a query that's not empty

The process is managed in `/app/api/chat/route.ts` (approximately lines 199-260).

## Implementation Details

### Deep Search Tool

The core implementation is in `/lib/chat/tools.ts`:

```typescript
deepSearch: tool({
  description: 'Perform a deep search using Perplexity API...',
  parameters: z.object({
    query: z.string().describe('The search query to research')
  }),
  execute: async ({ query }): Promise<string> => {
    // Implementation calls Perplexity API
    const openai = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });
    
    const response = await openai.chat.completions.create({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: 'You are a helpful research assistant...' },
        { role: 'user', content: query }
      ],
      max_tokens: 12000,
      temperature: 0.7,
    });
    
    return `DeepSearch Results for "${query}":\n\n${result}`;
  }
})
```

### Pre-Processing and Prompt Enhancement

In `/app/api/chat/route.ts`, DeepSearch results are appended to the system prompt:

```typescript
// Add deep search results to the system prompt if available
if (toolResults.deepSearch) {
  enhancedSystemPrompt += `\n\n### PERPLEXITY DEEP SEARCH TOOL RESULTS ###\nThe following information was retrieved using the Perplexity Deep Search tool:\n\n${toolResults.deepSearch}\n\n`;
  toolsUsed.push('Perplexity Deep Search');
}
```

This ensures the AI has access to the search results before generating its response.

### Preventing Duplicate Searches

To prevent duplicate searches, the DeepSearch tool is removed from the tools available to the LLM:

```typescript
const toolsToProvide = {
  getInformation: chatTools.getInformation,
  comprehensiveScraper: chatTools.comprehensiveScraper,
  detectAndScrapeUrls: chatTools.detectAndScrapeUrls,
  addResource: chatTools.addResource
  // deepSearch is intentionally removed to prevent duplicated searches
};
```

### Real-Time Progress Updates

Server-sent events (SSE) are used to provide real-time updates about DeepSearch progress:

1. When DeepSearch starts:
   ```typescript
   sendEventToClients({
     type: 'deepSearch',
     status: 'started',
     details: `Query length: ${userQuery.length} characters`
   });
   ```

2. When DeepSearch completes:
   ```typescript
   sendEventToClients({
     type: 'deepSearch',
     status: 'completed',
     details: `Retrieved ${deepSearchResult.length} characters of information`
   });
   ```

The client listens for these events using `/components/deep-search-tracker.tsx` and updates the UI accordingly.

## User Experience

1. User submits a query with DeepSearch enabled
2. "Thinking & searching..." indicator appears
3. DeepSearch queries the Perplexity API
4. Results are appended to the system prompt
5. AI generates a response using the enhanced prompt
6. AI's response includes a section at the end acknowledging the use of DeepSearch:
   ```
   --- Tools and Resources Used ---
   - Deep Search: Retrieved 2877 characters of additional context through web search
   ```

## Performance Considerations

- A 200ms delay is added before and after the DeepSearch to ensure a consistent user experience
- Perplexity API calls have a limit (check current Perplexity documentation for rate limits)
- Results are cached to improve performance and reduce API calls

## Troubleshooting

If DeepSearch isn't working:

1. Check if the Perplexity API key is correctly configured
2. Ensure DeepSearch is enabled in the UI
3. Look for errors in the server logs with the pattern `[PERPLEXITY DEEP SEARCH]`
4. Verify the SSE connection for real-time updates is working

## Future Improvements

Potential improvements to consider:

1. Add caching of DeepSearch results for identical or similar queries
2. Implement streaming of search results as they arrive
3. Add more granular progress updates during the search
4. Include search result metadata (sources, timestamps) in the response
5. Support searching for specific time periods (e.g., last week, last month)