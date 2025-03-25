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
| `/lib/chat/tools.ts` | Defines the DeepSearch tool interface and imports the implementation |
| `/lib/agents/tools/perplexity/api.ts` | Core client implementation for Perplexity API |
| `/app/api/perplexity/route.ts` | Internal API endpoint that communicates with Perplexity |
| `/app/api/chat/route.ts` | Manages when and how DeepSearch is triggered |
| `/app/api/events/route.ts` | Handles server-sent events for DeepSearch status |
| `/components/deep-search-tracker.tsx` | Client component for tracking DeepSearch progress |
| `/components/multimodal-input.tsx` | Contains the DeepSearch toggle button |
| `/stores/chat-store.ts` | Manages DeepSearch state |
| `/components/messages.tsx` | Displays "Thinking & searching..." indicator |
| `/middleware.ts` | Configures authentication exemptions for internal API calls |

### 3. How DeepSearch is Triggered

DeepSearch is triggered when:
1. The user has enabled DeepSearch (toggle in the UI)
2. A user submits a query that's not empty

The process is managed in `/app/api/chat/route.ts`.

## Implementation Details

### Architecture Flow

The DeepSearch implementation follows this architecture pattern:

1. User enables DeepSearch via toggle button in `multimodal-input.tsx`
2. Chat API detects DeepSearch is enabled
3. Internal utility in `/lib/agents/tools/perplexity/api.ts` is called directly from the chat route
4. Utility makes request to internal API endpoint `/api/perplexity`
5. Internal endpoint calls external Perplexity API
6. Results flow back through the chain and enhance the AI prompt

### Internal Authentication Mechanism

To allow server-to-server communication without user authentication issues:

1. The internal API utility sets a special User-Agent header:
   ```typescript
   headers: {
     "Content-Type": "application/json",
     "User-Agent": "Mozilla/5.0 SanDiego/1.0"
   }
   ```

2. The API endpoint checks for this header to identify internal requests:
   ```typescript
   const userAgent = req.headers.get('user-agent') || '';
   const isInternalRequest = userAgent.includes('SanDiego');
   if (isInternalRequest) {
     // Skip authentication for internal requests
   }
   ```

3. The middleware completely bypasses requests to `/api/perplexity`:
   ```typescript
   // Special bypass for Perplexity API to allow internal server-to-server communication
   if (request.nextUrl.pathname.startsWith('/api/perplexity')) {
     console.log('Bypassing auth middleware for Perplexity API');
     return;
   }
   ```

This comprehensive approach ensures that internal server-to-server communication works correctly, even when using Supabase authentication for other routes.

### DeepSearch Implementation Note

The DeepSearch functionality is not implemented as a standard tool that can be called by the AI. Instead, as noted in `lib/chat/tools.ts`:

```typescript
// Note: Deep Search is now exclusively a pre-processing step controlled by UI toggle
// The deepSearch tool has been removed to prevent the AI from calling it directly
```

This means DeepSearch is only triggered by user request via the UI toggle, not by the AI model itself.

### Perplexity API Configuration

The actual API call to Perplexity uses these parameters:

```typescript
const requestBody = {
  model: "sonar",  // Default model, sonar-pro is used for premium features
  messages: [{ role: "user", content: query }],
  temperature: 0.5,
  max_tokens: 1000,
  stream: false,
  web_search_options: {
    search_context_size: "high"
  }
};
```

### Pre-Processing and Prompt Enhancement

In `/app/api/chat/route.ts`, DeepSearch results are appended to the system prompt:

```typescript
// Add deep search results to the system prompt if available
if (toolResults.deepSearch) {
  enhancedSystemPrompt += `\n\n### DEEP SEARCH RESULTS ###\nThe following information was retrieved through deep web research:\n\n${toolResults.deepSearch}\n\n`;
  toolsUsed.push('Deep Search');
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
- Results are cached in Redis to improve performance and reduce API calls

## Troubleshooting

If DeepSearch isn't working:

1. **Authentication Issues**
   - Check for 401 Unauthorized errors in logs
   - Verify middleware is properly bypassing `/api/perplexity` routes
   - Confirm User-Agent header is properly set in internal requests
   - Add detailed request header logging to verify what's being sent and received
   - Ensure middleware early-return logic is working correctly

2. **API Configuration**
   - Check if the Perplexity API key is correctly configured
   - Verify the key is properly formatted and not expired
   - Make sure environment variables are properly loaded

3. **Client-Side Issues**
   - Ensure DeepSearch is enabled in the UI
   - Check browser console for any client-side errors

4. **Debugging**
   - Look for errors in the server logs with patterns like:
     - `perplexity_serverless_error`
     - `perplexity_call_error`
     - `perplexity_auth_error`
     - `deep_search_error`
     - `perplexity_headers_debug`
     - `perplexity_auth_debug`
   - Verify the SSE connection for real-time updates is working

## Common Errors and Solutions

| Error | Possible Causes | Solutions |
|-------|----------------|-----------|
| 401 Unauthorized | Authentication between services failing | Implement early-return in middleware, verify User-Agent header |
| 403 Forbidden | Invalid or expired API key | Refresh your Perplexity API key |
| 429 Too Many Requests | Rate limiting from Perplexity API | Implement better caching, reduce usage |
| 500 Internal Server Error | Server-side processing failures | Check logs for specific error messages |

## Future Improvements

Potential improvements to consider:

1. Add caching of DeepSearch results for identical or similar queries
2. Implement streaming of search results as they arrive
3. Add more granular progress updates during the search
4. Include search result metadata (sources, timestamps) in the response
5. Support searching for specific time periods (e.g., last week, last month)
6. Add fallback mechanisms when Perplexity API is unavailable
7. Implement adaptive timeout handling for varying query complexity