## Tool Calling Implementation Guide

This document outlines how we implement tool calling functionality in our application using Vercel AI SDK. Tool calling enables AI models to invoke specific functions to perform tasks like vector search, web scraping, and web research.

### Core Concepts

Tools in the Vercel AI SDK contain three key elements:

1. **description**: An optional description that influences when the tool is selected
2. **parameters**: A Zod schema or JSON schema that defines the required parameters
3. **execute**: An async function that runs when the tool is called and returns results

### Basic Implementation Pattern

Here's how we implement tools using Vercel AI SDK:

```typescript
import { z } from 'zod';
import { generateText, tool } from 'ai';

const result = await generateText({
  model: openai('gpt-4o'),
  tools: {
    getInformation: tool({
      description: 'Search the knowledge base for information on a topic',
      parameters: z.object({
        query: z.string().describe('The topic to search for')
      }),
      execute: async ({ query }) => {
        // Implementation of knowledge base search
        const results = await performVectorSearch(query);
        return formatResults(results);
      }),
    }),
  },
  prompt: 'What is the best pricing strategy for portrait photographers?',
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
     execute: async ({ query }) => {
       // Vector search implementation
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
     execute: async ({ url }) => {
       // Web scraping implementation
       return scrapedContent;
     }
   });
   ```

3. **Deep Search Tool**: Performs web research via Perplexity API
   ```typescript
   export const deepSearchTool = tool({
     description: 'Search the web for up-to-date information',
     parameters: z.object({
       search_term: z.string().describe('The research query')
     }),
     execute: async ({ search_term }, options) => {
       // Deep search implementation with safety checks
       const deepSearchEnabled = options.body?.deepSearchEnabled === true;
       
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
// Parameter schema
const knowledgeBaseSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(1000, "Query must not exceed 1000 characters")
    .describe("The search query to find information in the knowledge base")
});

// Safety check in execute function
if (!query || query.trim().length < 2) {
  return "Please provide a valid search query with at least 2 characters";
}
```

### Tool Registration and Configuration

We use a registry system for conditional tool inclusion:

```typescript
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
  useRagTool?: boolean;
}): Record<string, any> {
  const {
    useKnowledgeBase = true,
    useWebScraper = false,
    useDeepSearch = false,
    useRagTool = true
  } = options;

  const toolSet = {};

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
  model: openai('gpt-4o'),
  messages,
  tools,
  maxSteps: 5, // Allow up to 5 steps
  onFinish: async ({ response }) => {
    // Handle message persistence here
    await saveMessages(id, response.messages);
  },
});
```

Steps during the tool calling flow:

1. **Step 1**: AI receives user prompt and calls a knowledge base tool
2. **Step 2**: AI receives knowledge base results and calls web scraper tool
3. **Step 3**: AI receives web scraper results and generates final text

### Tool Execution Options

Tool functions receive an optional second parameter with additional context:

```typescript
execute: async (params, options) => {
  // Access tool call ID
  const { toolCallId } = options;
  
  // Access message history
  const { messages } = options;
  
  // Access abort signal
  const { abortSignal } = options;
  
  // Additional custom data passed from the route handler
  // @ts-ignore - Custom property
  const { sessionId, deepSearchEnabled } = options.body || {};
  
  // Implementation here
}
```

### Client Disconnect Handling

To ensure message persistence even when clients disconnect, we use Vercel AI SDK's `consumeStream()` method:

```typescript
const result = await streamText({
  model: openai('gpt-4o'),
  messages,
  onFinish: async ({ response }) => {
    // Save messages to database
    await persistenceService.saveMessages(response.messages);
  },
});

// Consume the stream to ensure it runs to completion & triggers onFinish
// even when the client response is aborted:
result.consumeStream(); // no await

return result.toDataStreamResponse();
```

This ensures:
- Message persistence completes even when clients close their browsers
- All `onFinish` callbacks are triggered properly
- Chat history remains consistent between sessions

### Error Handling

We implement robust error handling for tool calls:

```typescript
try {
  const result = await streamText({
    // Configuration
  });
  
  result.consumeStream();
  return result.toDataStreamResponse();
} catch (error) {
  if (NoSuchToolError.isInstance(error)) {
    edgeLogger.error('Unknown tool called', { toolName, error: error.message });
    return new Response(JSON.stringify({ error: 'Unknown tool called' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  } else if (InvalidToolArgumentsError.isInstance(error)) {
    edgeLogger.error('Invalid tool arguments', { error: error.message });
    return new Response(JSON.stringify({ error: 'Invalid tool arguments' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  } else if (ToolExecutionError.isInstance(error)) {
    edgeLogger.error('Tool execution failed', { error: error.message });
    return new Response(JSON.stringify({ error: 'Tool execution failed' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  
  // General error handling
  edgeLogger.error('Unhandled error in streamText', { error: error.message });
  return new Response(JSON.stringify({ error: 'An error occurred' }), 
    { status: 500, headers: { 'Content-Type': 'application/json' } });
}
```

### Logging and Monitoring

We implement comprehensive logging for tool calls:

```typescript
edgeLogger.info('Tool called', {
  toolName,
  toolCallId,
  operationId,
  category: LOG_CATEGORIES.TOOLS,
  parameterLength: JSON.stringify(params).length,
  // Limited parameter preview for debugging
  parameterPreview: JSON.stringify(params).substring(0, 200)
});

// After execution
edgeLogger.info('Tool execution complete', {
  toolName,
  toolCallId,
  operationId,
  category: LOG_CATEGORIES.TOOLS,
  durationMs: Date.now() - startTime,
  resultLength: result ? String(result).length : 0
});
```

### Frontend Integration

We use the `useChat` hook from Vercel AI SDK with our custom optimizations:

```typescript
const {
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
} = useChat({
  id: sessionId,
  body: {
    id: sessionId,
    deepSearchEnabled,
    agentId
  },
  // Send only the last message to the server
  experimental_prepareRequestBody({ messages, id }) {
    return {
      message: messages[messages.length - 1],
      id,
      deepSearchEnabled,
      agentId
    };
  }
});
```

### Best Practices

1. **Tool Descriptions**: Be specific about what each tool does and when it should be used
2. **Parameter Validation**: Use Zod to validate all parameters with descriptive error messages
3. **Conditional Inclusion**: Only include tools that are necessary for specific use cases
4. **Error Handling**: Implement thorough error handling and logging for all tool operations
5. **Safety Checks**: Add runtime verification of safety settings in tool execution functions
6. **Message Persistence**: Use `consumeStream()` to ensure message history is saved correctly
7. **Performance Monitoring**: Log execution time and result sizes for performance tracking

### References

- [Vercel AI SDK Tools Documentation](https://sdk.vercel.ai/docs/getting-started/tools)
- [AI SDK on GitHub](https://github.com/vercel/ai)
- [Handling Client Disconnects](https://sdk.vercel.ai/docs/concepts/message-persistence#handling-client-disconnects)
- [Zod Schema Validation](https://zod.dev/)