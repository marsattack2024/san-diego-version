## Tool Calling Implementation Guide

This document outlines how we implement tool calling functionality in our application using Vercel AI SDK. Tool calling enables AI models to invoke specific functions to perform tasks like vector search, web scraping, and web research.

### Core Concepts

Tools in the Vercel AI SDK contain three key elements:

1. **description**: A detailed description that influences when the tool is selected
2. **parameters**: A Zod schema that defines the required parameters with proper validation
3. **execute**: An async function that runs when the tool is called and returns results

### Basic Implementation Pattern

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
      execute: async ({ query }, runOptions) => {
        // Implementation of knowledge base search
        const results = await performVectorSearch(query);
        return formatResults(results);
      }),
    }),
  },
  maxSteps: 5, // Allow multiple steps for complex reasoning
  toolChoice: 'auto', // Enable automatic tool selection
});
```

### Our Tools Implementation

Our application uses the following tools:

1. **Knowledge Base Tool**: Searches our vectorized content
   ```typescript
   export const knowledgeBaseTool = tool({
     description: 'Search the knowledge base for relevant information',
     parameters: z.object({
       query: z.string().describe('The search query')
     }),
     execute: async ({ query }, runOptions) => {
       // Vector search implementation with proper logging
       const operationId = `kb-search-${Date.now().toString(36)}`;
       edgeLogger.info("Knowledge base search started", {
         category: LOG_CATEGORIES.TOOLS,
         operation: "kb_search_started",
         operationId,
         toolCallId: runOptions.toolCallId,
       });
       
       return searchResults;
     }
   });
   ```

2. **Web Scraper Tool**: Extracts content from web pages
   ```typescript
   export const webScraperTool = tool({
     description: 'Scrape content from web pages',
     parameters: z.object({
       url: z.string().describe('The URL to scrape')
     }),
     execute: async ({ url }, runOptions) => {
       // Web scraping implementation with safety checks
       const operationId = `web-scrape-${Date.now().toString(36)}`;
       
       // Validate URL for safety
       if (!isValidUrl(url)) {
         return "Please provide a valid URL";
       }
       
       return scrapedContent;
     }
   });
   ```

3. **Deep Search Tool**: Performs web research via Perplexity API
   ```typescript
   export const deepSearchTool = tool({
     description: 'Search the web for up-to-date information about any topic',
     parameters: z.object({
       search_term: z.string().describe('The specific search term to look up on the web')
     }),
     execute: async ({ search_term }, runOptions) => {
       // Deep search implementation with safety checks
       const operationId = `deep-search-${Date.now().toString(36)}`;
       
       // Runtime verification that deep search is enabled
       const deepSearchEnabled = runOptions.body?.deepSearchEnabled === true;
       
       if (!deepSearchEnabled) {
         return "Deep Search is not enabled for this conversation";
       }
       
       return await performDeepSearch(search_term);
     }
   });
   ```

### Tool Parameters and Safety

We use Zod for parameter validation and additional safety checks:

```typescript
// Parameter schema with detailed validation
const knowledgeBaseSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(1000, "Query must not exceed 1000 characters")
    .describe("The search query to find information in the knowledge base")
});

// Multiple safety checks in execute function
if (!query || query.trim().length < 2) {
  return "Please provide a valid search query with at least 2 characters";
}

// Time executions for performance monitoring
const startTime = Date.now();
const result = await performSearch(query);
const duration = Date.now() - startTime;

// Log performance metrics
edgeLogger.info("Search completed", {
  durationMs: duration,
  resultSize: result?.length || 0
});
```

### Tool Registration and Configuration

We use a registry system for conditional tool inclusion:

```typescript
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
    useKnowledgeBase,
    useWebScraper,
    useDeepSearch
  });

  if (useKnowledgeBase) {
    toolSet.getInformation = knowledgeBaseTool;
  }

  if (useWebScraper) {
    toolSet.scrapeWebContent = webScraperTool;
  }

  if (useDeepSearch) {
    toolSet.deepSearch = deepSearchTool;
  }

  return toolSet;
}
```

### Multi-Step Tool Calling

We support multi-step tool calling with the `maxSteps` parameter:

```typescript
const result = await streamText({
  model: openai(model || 'gpt-4o'),
  messages,
  system: systemPrompt,
  tools,
  maxSteps: 5, // Allow up to 5 steps
  toolChoice: useDeepSearch ? 'auto' : 'none', // Conditionally enable tools
  onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
    // Log step completion
    edgeLogger.info('Step completed in multi-step execution', {
      operation: operationName,
      hasText: !!text && text.length > 0,
      textLength: text?.length || 0,
      toolCallCount: toolCalls?.length || 0,
      toolResultCount: toolResults?.length || 0,
      finishReason,
      usage: usage ? {
        completionTokens: usage.completionTokens,
        promptTokens: usage.promptTokens,
        totalTokens: usage.totalTokens
      } : undefined
    });
  },
});
```

Steps during the tool calling flow:

1. **Step 1**: AI receives user prompt and calls a knowledge base tool
2. **Step 2**: AI receives knowledge base results and calls web scraper tool
3. **Step 3**: AI receives web scraper results and generates final text

### Tool Execution Options

Tool functions receive an options parameter with additional context:

```typescript
execute: async (params, runOptions) => {
  // Access tool call ID for tracking
  const { toolCallId } = runOptions;
  
  // Access message history if needed
  const { messages } = runOptions;
  
  // Access abort signal for cancellation support
  const { abortSignal } = runOptions;
  
  // Additional custom data passed from the route handler
  const deepSearchEnabled = runOptions.body?.deepSearchEnabled === true;
  const sessionId = runOptions.body?.sessionId;
  
  // Implementation with tracking
  const operationId = `${toolName}-${Date.now().toString(36)}`;
  
  // Log operation
  edgeLogger.info(`Tool execution started`, {
    toolName,
    toolCallId,
    operationId,
    sessionId
  });
  
  // Implementation here
}
```

### Client Disconnect Handling

To ensure message persistence even when clients disconnect, we use Vercel AI SDK's `consumeStream()` method:

```typescript
const result = await streamText({
  model: openai(model || 'gpt-4o'),
  messages,
  system: systemPrompt,
  tools,
  maxSteps: 5,
  toolChoice: useDeepSearch ? 'auto' : 'none',
});

// Consume the stream to ensure it runs to completion even when the client disconnects
result.consumeStream(); // no await

edgeLogger.info('Stream consumption enabled to ensure processing completes', {
  operation: operationName,
  sessionId
});

return result.toDataStreamResponse();
```

### Error Handling

We implement robust error handling for tool calls:

```typescript
try {
  // Tool implementation
  const clientStatus = perplexityService.initialize();
  if (!clientStatus.isReady) {
    throw new Error("Perplexity API client is not ready");
  }
  
  const result = await perplexityService.search(query);
  return result.content;
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Enhanced error logging
  edgeLogger.error("Tool error", {
    category: LOG_CATEGORIES.TOOLS,
    operation: "tool_error",
    operationId,
    toolCallId: runOptions.toolCallId,
    errorMessage,
    errorType: error instanceof Error ? error.name : typeof error,
    errorStack: error instanceof Error ? error.stack : 'No stack available',
    important: true
  });
  
  // Return user-friendly error message
  return `I encountered an error: ${errorMessage}. Please try again or contact support.`;
}
```

### Prompting for Tool Use

We enhance our system prompts with specific instructions for tool usage:

```typescript
export function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string {
  // Get the base system prompt
  const basePrompt = buildSystemPrompt(agentType);

  // Add tool descriptions
  const withToolDescription = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following resources:\n` +
    `- Knowledge Base: Retrieve information from our internal knowledge base\n` +
    `- Web Scraper: Extract content from specific URLs provided by the user\n` +
    `- Deep Search: Conduct in-depth research on complex topics using Perplexity AI\n\n` +
    `Use these resources when appropriate to provide accurate and comprehensive responses.`;

  // Add Deep Search-specific instructions
  const deepsearchInstructions = deepSearchEnabled
    ? `### DEEP SEARCH INSTRUCTIONS:\n\n` +
      `DeepSearch is enabled for this conversation. When you use the deepSearch tool:\n` +
      `1. You MUST directly incorporate the information retrieved from Deep Search into your response\n` +
      `2. You MUST clearly attribute information from Deep Search\n` +
      `3. You MUST prefer Deep Search results over your pre-existing knowledge for factual questions\n` +
      `4. For questions seeking current information, ALWAYS use the deepSearch tool\n` +
      `5. When citing specific information, include the source name and URL when available\n`
    : `NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool.`;
  
  // Add attribution requirements
  const attributionSection = `### ATTRIBUTION FORMAT:\n\n` +
    `At the end of your response, you MUST include a section that explicitly states which resources you used.`;

  return `${withToolDescription}\n\n${deepsearchInstructions}\n\n${attributionSection}`;
}
```

### Best Practices

1. **Tool Descriptions**: Be specific about what each tool does and when it should be used
2. **Parameter Validation**: Use Zod to validate all parameters with descriptive error messages
3. **Conditional Inclusion**: Only include tools that are necessary for specific use cases
4. **Error Handling**: Implement thorough error handling and logging for all tool operations
5. **Safety Checks**: Add runtime verification of safety settings in tool execution functions
6. **Message Persistence**: Use `consumeStream()` to ensure message history is saved correctly
7. **Performance Monitoring**: Log execution time and result sizes for performance tracking
8. **Explicit Attribution**: Configure system prompts to encourage proper citation of tool results
9. **Multi-Step Reasoning**: Use maxSteps parameter to allow complex multi-tool interactions
10. **Conditional Tool Choice**: Set toolChoice based on enabled features

### References

- [Vercel AI SDK Tools Documentation](https://sdk.vercel.ai/docs/getting-started/tools)
- [AI SDK on GitHub](https://github.com/vercel/ai)
- [Handling Client Disconnects](https://sdk.vercel.ai/docs/concepts/message-persistence#handling-client-disconnects)
- [Zod Schema Validation](https://zod.dev/)