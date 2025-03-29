# Perplexity API Integration Guide

This document outlines the implementation details of the Perplexity API integration in our chat application, providing web search capabilities through the Deep Search feature.

## API Specification

### Chat Completions Endpoint

```
POST https://api.perplexity.ai/chat/completions
```

### Headers
- **Authorization**: Bearer token authentication required (`Bearer <your_api_key>`)
- **Content-Type**: application/json

### Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | The model to use (e.g., "sonar") |
| messages | array | Yes | Array of message objects with role and content |
| max_tokens | integer | No | Maximum number of tokens to generate |
| temperature | number | No | Randomness of the response (0-2, default: 0.2) |
| top_p | number | No | Nucleus sampling threshold (0-1, default: 0.9) |
| search_domain_filter | array | No | List of domains to limit search results to |
| return_images | boolean | No | Whether to include images in results (default: false) |
| return_related_questions | boolean | No | Whether to include related questions (default: false) |
| search_recency_filter | string | No | Filter by time (e.g., 'week', 'day') |
| top_k | number | No | Number of tokens for top-k filtering (default: 0) |
| stream | boolean | No | Stream the response incrementally (default: false) |
| presence_penalty | number | No | Penalty for repetitive tokens (default: 0) |
| frequency_penalty | number | No | Penalty for repeated topics (default: 1) |
| web_search_options | object | No | Configuration for web search usage |

#### Example Request

```json
{
  "model": "sonar",
  "messages": [
    {
      "role": "system",
      "content": "Be precise and concise."
    },
    {
      "role": "user",
      "content": "How many stars are there in our galaxy?"
    }
  ],
  "temperature": 0.2,
  "top_p": 0.9,
  "web_search_options": {
    "search_context_size": "high"
  }
}
```

## Implementation in Our System

### Architecture Overview

Our Deep Search implementation follows a service-oriented architecture:

1. **Tool Definition** (`lib/chat-engine/tools/deep-search.ts`): Implements the Vercel AI SDK tool interface
2. **Service Layer** (`lib/services/perplexity.service.ts`): Abstracts API interactions and caching
3. **API Proxy** (`app/api/perplexity/route.ts`): Serverless endpoint to securely manage credentials

### DeepSearch Tool Implementation

The Deep Search tool follows the Vercel AI SDK tool pattern with multiple security layers:

```typescript
export const deepSearchTool = tool({
  description: "Search the web for up-to-date information about any topic.",
  parameters: z.object({
    search_term: z.string().describe("The search query to investigate thoroughly")
  }),
  execute: async ({ search_term }, runOptions) => {
    // Safety check: Verify deep search is explicitly enabled
    const deepSearchEnabled = runOptions.body?.deepSearchEnabled === true;
    
    if (!deepSearchEnabled) {
      edgeLogger.warn("Deep Search tool called but not enabled", {
        category: LOG_CATEGORIES.TOOLS,
        operation: "deep_search_blocked",
        reason: "flag_not_enabled"
      });
      return "Deep Search is not enabled for this conversation.";
    }
    
    // Call Perplexity API via our service
    const result = await perplexityService.search(search_term);
    return result.content;
  }
});
```

### Service Layer

The Perplexity service abstracts the API calls and provides error handling:

```typescript
class PerplexityService {
  public async search(query: string): Promise<PerplexitySearchResult> {
    // Determine the API URL based on environment
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = process.env.NODE_ENV === 'development'
      ? 'localhost:3000'
      : (process.env.NEXT_PUBLIC_HOST || 'marlan.photographytoprofits.com');

    const apiUrl = `${protocol}://${host}/api/perplexity`;
    
    // Set up request headers with internal identification
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 SanDiego/1.0"
    };
    
    // Make the API request
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    });
    
    // Handle response
    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result.data;
  }
}

export const perplexityService = new PerplexityService();
```

### API Proxy

Our API proxy for Perplexity manages credentials and authentication:

```typescript
// In app/api/perplexity/route.ts
export async function POST(req: Request) {
  // Extract query from request body
  const { query } = await req.json();
  
  // Perplexity API configuration
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const model = process.env.PERPLEXITY_MODEL || "sonar";
  
  const requestBody = {
    model,
    messages: [{ role: "user", content: query }],
    temperature: 0.5,
    max_tokens: 1000,
    web_search_options: {
      search_context_size: "high"
    }
  };
  
  // Call the Perplexity API
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${perplexityApiKey}`
    },
    body: JSON.stringify(requestBody)
  });
  
  // Process response
  const result = await response.json();
  
  // Return formatted result
  return Response.json({
    success: true,
    data: {
      content: result.choices[0].message.content,
      model: result.model,
      timing: { total: Date.now() - startTime }
    }
  });
}
```

## Integration with Chat Engine

The Deep Search feature is conditionally enabled in the chat engine based on:

1. **User Toggle**: The user must explicitly enable the feature via the UI
2. **Agent Capability**: Only specific agent types (copywriting, google-ads, facebook-ads) support Deep Search
3. **Tool Definition**: The `createToolSet` function only includes the Deep Search tool when both conditions are met

```typescript
// In app/api/chat/route.ts
// Only enable Deep Search if both the user has toggled it AND the agent supports it
const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

// Create tools object with conditional inclusion of Deep Search
const tools = createToolSet({
  useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
  useWebScraper: agentConfig.toolOptions.useWebScraper,
  useDeepSearch: shouldUseDeepSearch, // Only include if explicitly enabled
  useRagTool: agentConfig.toolOptions.useRagTool
});
```

## System Prompt Integration

The system prompt is enhanced with information about Deep Search availability:

```typescript
// In lib/chat-engine/prompts/index.ts
// Add DeepSearch-specific instructions
const withDeepSearchInstructions = withToolDescription + "\n\n" + (
  deepSearchEnabled
    ? "IMPORTANT: DeepSearch is enabled for this conversation. Use the deepSearch tool for research-intensive questions."
    : "NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool."
);
```

## Security Considerations

The Deep Search implementation includes multi-layered protection:

1. **Conditional Tool Inclusion**: The tool is only included when explicitly enabled
2. **Prompt Level Instructions**: The system prompt indicates Deep Search availability
3. **Runtime Check**: The execute function verifies the DeepSearch flag at runtime
4. **Internal API**: Credentials are never exposed to the client
5. **Identification Headers**: The internal API uses a specific User-Agent for validation

## Performance Optimization

The Deep Search feature includes performance optimizations:

1. **Redis Caching**: Results are cached for 1 hour to improve response times
2. **Smart Retry Logic**: Automatic retries with exponential backoff for transient errors
3. **Request Validation**: Queries are validated before sending to the API
4. **Timeouts**: API calls are set with appropriate timeouts to prevent hanging requests
5. **Logging**: Detailed performance metrics are logged for monitoring

## User Interface Integration

The Deep Search feature is exposed to users through:

1. **Toggle Control**: A switch in the UI allows enabling/disabling Deep Search
2. **Status Indicator**: Users see when Deep Search is being performed
3. **Progress Updates**: Server-sent events provide real-time progress information
4. **Tool Usage Attribution**: Results clearly indicate when Deep Search was used

## Troubleshooting

Common issues and their solutions:

1. **API Key Format**: Ensure the `PERPLEXITY_API_KEY` starts with "pplx-"
2. **Timeouts**: Check the API timeout settings if requests are hanging
3. **Rate Limits**: Monitor for rate limit errors and implement appropriate backoff
4. **Response Format**: Verify the response parsing if you get unexpected results

## References

- [Perplexity API Documentation](https://docs.perplexity.ai/)
- [Vercel AI SDK Tool Documentation](https://sdk.vercel.ai/docs/guides/tools)
- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/)