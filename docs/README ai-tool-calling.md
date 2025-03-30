# Tool Calling Implementation Guide

This document outlines how we implement tool calling functionality in our application using Vercel AI SDK. Tool calling enables AI models to invoke specific functions to perform tasks like vector search, web scraping, and web research.

## Core Concepts

Tools in the Vercel AI SDK contain three key elements:

1. **description**: A detailed description that influences when the tool is selected
2. **parameters**: A Zod schema that defines the required parameters with proper validation
3. **execute**: An async function that runs when the tool is called and returns results

## Basic Implementation Pattern

Here's how we implement tools using Vercel AI SDK:

```typescript
import { z } from 'zod';
import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4o'),
  messages,
  system: systemPrompt,
  tools: {
    getInformation: tool({
      description: 'Search the knowledge base for information on a topic',
      parameters: z.object({
        query: z.string().describe('The topic to search for')
      }),
      execute: async ({ query }, { toolCallId }) => {
        // Implementation of knowledge base search
        const results = await performVectorSearch(query);
        return formatResults(results);
      }),
    }),
  },
  toolChoice: 'auto', // Enable automatic tool selection
});
```

## Our Tools Implementation

Our application uses the following tools:

### 1. Knowledge Base Tool (`lib/tools/knowledge-base.tool.ts`)

```typescript
export const knowledgeBaseTool = tool({
  description: 'Search the knowledge base for information relevant to the query. Use this when you need specific information about photography services, marketing, or business practices.',
  parameters: z.object({
    query: z.string().describe('The search query to find relevant information from the knowledge base')
  }),
  execute: async ({ query }, { toolCallId }) => {
    try {
      // Log the start of the knowledge base search
      edgeLogger.info('Knowledge base search started', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'knowledge_base_search',
        toolCallId,
        query
      });

      const startTime = Date.now();

      // Use the existing vector search function
      const result = await findSimilarDocumentsOptimized(query, {
        limit: 5,
        sessionId: toolCallId
      });

      // Format and return results
      return {
        content: formattedContent,
        documents: documents.map(doc => ({
          id: doc.id,
          content: typeof doc.content === 'string' ? doc.content : String(doc.content),
          similarity: doc.similarity || 0
        })),
        meta: {
          count: documents.length,
          fromCache: metrics.fromCache
        }
      };
    } catch (error) {
      // Handle and log errors
      return {
        content: `Error searching the knowledge base: ${errorMessage}`,
        error: errorMessage,
        documents: []
      };
    }
  }
});
```

### 2. Web Scraper Tool (`lib/tools/web-scraper.tool.ts`)

```typescript
export const webScraperTool = tool({
  description: 'Scrapes content from web pages. Use this to extract information from a specific URL shared by the user.',
  parameters: z.object({
    urls: z.array(z.string()).describe('The URLs to scrape, provided by the user')
  }),
  execute: async ({ urls }, { toolCallId }) => {
    try {
      // Log the start of web scraping
      edgeLogger.info('Web scraping started', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'web_scraping_started',
        toolCallId,
        urlCount: urls.length
      });

      // Create puppeteer service
      const puppeteerService = new PuppeteerService();
      
      // Process each URL
      const results = await Promise.all(
        urls.map(async (url) => {
          // Validate and sanitize URL
          const sanitizedUrl = puppeteerService.validateAndSanitizeUrl(url);
          if (!sanitizedUrl) {
            return { url, content: `Invalid URL: ${url}`, error: true };
          }
          
          // Scrape content
          const scraped = await puppeteerService.scrapeUrl(sanitizedUrl);
          return { url: sanitizedUrl, content: scraped.content, title: scraped.title };
        })
      );
      
      // Format results
      return formatScrapedResults(results);
    } catch (error) {
      // Handle and log errors
      return `Error scraping web content: ${errorMessage}. Please make sure the URLs are valid and accessible.`;
    }
  }
});
```

### 3. Deep Search Tool (`lib/tools/deep-search.tool.ts`)

```typescript
export const deepSearchTool = tool({
  description: "Search the web for up-to-date information about any topic. Use this when you need information that might not be in your training data or when you need to verify current facts.",
  parameters: z.object({
    search_term: z.string().describe("The specific search term to look up on the web. Be as specific as possible.")
  }),
  execute: async ({ search_term }, { toolCallId, body }) => {
    const operationId = `deep-search-${Date.now().toString(36)}`;
    const startTime = Date.now();

    try {
      // Extract deepSearchEnabled from the options payload
      const deepSearchEnabled = body?.deepSearchEnabled === true;

      // Security check: Verify deep search is explicitly enabled
      if (!deepSearchEnabled) {
        edgeLogger.warn("Deep Search tool was invoked without being enabled", {
          category: LOG_CATEGORIES.TOOLS,
          operation: 'deep_search_security',
          toolCallId,
          searchTerm: search_term
        });
        
        return "I'm sorry, but web search capabilities are not enabled for this conversation.";
      }
      
      // Initialize Perplexity client and verify it's ready
      const clientStatus = perplexityService.initialize();
      if (!clientStatus.isReady) {
        throw new Error("Perplexity API client is not ready");
      }

      // Format the search query for better results
      const query = formatSearchQuery(search_term);
      
      // Call the Perplexity API via our service
      const result = await perplexityService.search(query);
      
      return result.content;
    } catch (error) {
      // Enhanced error logging and user-friendly response
      return `I encountered an error while searching for information: ${errorMessage}. Please try again with a more specific search term.`;
    }
  }
});
```

## Tool Registry Implementation

We use a centralized registry for conditional tool inclusion:

```typescript
// In lib/tools/registry.tool.ts
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
  const {
    useKnowledgeBase = true,
    useWebScraper = false,
    useDeepSearch = false
  } = options;

  const toolSet: Record<string, Tool<any, any>> = {};

  // Log tool set creation
  edgeLogger.info('Creating custom tool set', {
    category: LOG_CATEGORIES.TOOLS,
    operation: 'create_tool_set',
    useKnowledgeBase,
    useWebScraper,
    useDeepSearch
  });

  // Add knowledge base tool if enabled
  if (useKnowledgeBase) {
    toolSet.getInformation = knowledgeBaseTool;
  }

  // Add web scraper tool if enabled
  if (useWebScraper) {
    toolSet.scrapeWebContent = webScraperTool;
  }

  // Add Deep Search tool ONLY if explicitly enabled
  if (useDeepSearch) {
    toolSet.deepSearch = deepSearchTool;
  }

  return toolSet;
}
```

## Integration with Chat Engine

The tools are integrated into the Chat Engine using Vercel AI SDK's `streamText` function:

```typescript
// In lib/chat-engine/core.ts
const result = await streamText({
  model: openai(this.config.model || 'gpt-4o'),
  messages: formattedMessages,
  system: this.config.systemPrompt,
  tools: this.config.tools,
  temperature: this.config.temperature,
  maxTokens: this.config.maxTokens,
  body: this.config.body, // Pass custom configuration to tool execution
  onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
    // Process step completion
    toolCallsProcessed += toolCalls?.length || 0;
    
    // Log completion of each step
    edgeLogger.info('Step completed in tool execution', {
      operation: operationName,
      hasText: !!text && text.length > 0,
      textLength: text?.length || 0,
      toolCallCount: toolCalls?.length || 0,
      toolCallsProcessed,
      finishReason
    });
  },
  onFinish({ text, response, usage }) {
    // Process completion of the entire sequence
    edgeLogger.info('Stream text completed', {
      operation: operationName,
      textLength: text?.length || 0,
      toolCallsProcessed,
      completionTokens: usage?.completionTokens,
      promptTokens: usage?.promptTokens,
      totalTokens: usage?.totalTokens
    });
  }
});

// Consume the stream in the background to ensure callbacks run
// even if the client disconnects from the HTTP response
result.consumeStream();

edgeLogger.info('Stream consumption enabled to ensure processing completes', {
  operation: this.config.operationName,
  sessionId: context.sessionId
});

return result.toDataStreamResponse();
```

## Safety and Error Handling

### Parameter Validation with Zod

```typescript
// Parameter schema with detailed validation
const knowledgeBaseSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(1000, "Query must not exceed 1000 characters")
    .describe("The search query to find information in the knowledge base")
});
```

### Runtime Security Checks

```typescript
// Inside Deep Search tool execution
const deepSearchEnabled = body?.deepSearchEnabled === true;

// CRITICAL SAFETY CHECK: Verify deep search is explicitly enabled
if (!deepSearchEnabled) {
  edgeLogger.warn("Deep Search tool was invoked without being enabled", {
    category: LOG_CATEGORIES.TOOLS,
    operation: 'deep_search_security',
    toolCallId,
    searchTerm: search_term
  });
  
  return "I'm sorry, but web search capabilities are not enabled for this conversation.";
}
```

### Comprehensive Error Handling

```typescript
try {
  // Tool implementation
  const result = await perplexityService.search(query);
  return result.content;
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Enhanced error logging
  edgeLogger.error("Deep Search error", {
    category: LOG_CATEGORIES.TOOLS,
    operation: "deep_search_error",
    operationId,
    toolCallId,
    errorMessage,
    errorType: error instanceof Error ? error.name : typeof error,
    errorStack: error instanceof Error ? error.stack : 'No stack available',
    durationMs: duration,
    searchTerm: search_term,
    important: true
  });
  
  // Return user-friendly error message
  return `I encountered an error while searching for information: ${errorMessage}. Please try again with a more specific search term.`;
}
```

## Client Disconnect Handling

We ensure message persistence even when clients disconnect by using `consumeStream()`:

```typescript
// In lib/chat-engine/core.ts
result.consumeStream(); // No await - runs in the background

// In app/api/chat/route.ts
if (response.body && 'consumeStream' in response) {
  // Non-awaited call so we don't block the response
  (response as any).consumeStream();

  edgeLogger.info('Stream consumption initiated to handle potential client disconnects', {
    operation: 'route_handler',
    sessionId
  });
}
```

## System Prompts for Tool Usage

We enhance system prompts with specific instructions for tool usage:

```typescript
// In lib/chat-engine/prompts/index.ts
export function buildSystemPrompt(agentType: AgentType, useDeepSearch = false): string {
  // Get the base prompt for the specific agent type
  const basePrompt = getBasePromptForAgent(agentType);
  
  // Add tool instructions
  const withToolInstructions = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following tools:\n` +
    `- Knowledge Base (getInformation): Retrieve information from our internal knowledge base\n` +
    `- Web Scraper (scrapeWebContent): Extract content from specific URLs provided by the user\n` +
    (useDeepSearch ? `- Deep Search (deepSearch): Conduct web searches for up-to-date information\n` : '');
  
  // Add Deep Search-specific instructions if enabled
  const deepSearchInstructions = useDeepSearch
    ? `\n### DEEP SEARCH USAGE:\n\n` +
      `When using the Deep Search tool:\n` +
      `1. Use it for questions about current events or information that may not be in your training data\n` +
      `2. Be specific with your search terms for better results\n` +
      `3. Clearly cite information obtained through Deep Search in your responses\n`
    : `\nNOTE: Web searching is not available for this conversation. Do not use the deepSearch tool.`;
  
  return `${withToolInstructions}${deepSearchInstructions}`;
}
```

## Best Practices

1. **Tool Descriptions**: Create specific descriptions that help the model decide when to use a tool
2. **Parameter Validation**: Use Zod for parameter validation with descriptive error messages
3. **Conditional Inclusion**: Use the tool registry to selectively include tools based on configuration
4. **Comprehensive Logging**: Implement detailed logging for tool execution and results
5. **Error Handling**: Handle errors gracefully with user-friendly messages
6. **Security Verification**: Add runtime security checks for sensitive operations
7. **Client Disconnect Handling**: Use `consumeStream()` to ensure tool processing completes
8. **Performance Monitoring**: Track execution time and result sizes
9. **Tool-Specific Prompts**: Enhance system prompts with tool usage instructions
10. **Selective Tool Choice**: Use toolChoice based on configuration (auto vs. none)

## References

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Vercel AI SDK Tools Guide](https://sdk.vercel.ai/docs/getting-started/tools)
- [Handling Client Disconnects](https://sdk.vercel.ai/docs/concepts/message-persistence#handling-client-disconnects)
- [Zod Schema Validation](https://zod.dev/)