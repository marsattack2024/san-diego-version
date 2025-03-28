# Agent Tools Architecture

This document describes the implementation of AI tools in the San Diego application, including both AI SDK tools and preprocessing features.

## Overview

The San Diego application employs a hybrid approach to AI tooling:

1. **AI SDK Tools**: Knowledge Base and Web Scraper are implemented as AI SDK tools, allowing the model to actively decide when to use these tools during conversation.

2. **Preprocessing Features**: Deep Search operates as a preprocessing step controlled by user toggles, with results embedded directly in the system prompt.

This hybrid approach combines the best of both worlds: giving the AI model the ability to proactively use tools when needed while ensuring high-quality context is always available through preprocessing.

## AI SDK Tools

The application implements two primary AI SDK tools:

### Knowledge Base Tool

```typescript
getInformation: tool({
  description: 'Search the internal knowledge base for relevant information about photography business topics',
  parameters: getInformationSchema,
  execute: async ({ query }) => {
    // Implementation that searches vector database
    const result = await findSimilarDocumentsOptimized(query, {
      limit: 5,
      similarityThreshold: 0.65
    });
    
    // Format and return results
    return formattedResults;
  }
})
```

The Knowledge Base tool:
- Provides access to internal knowledge about photography business topics
- Uses vector search to find relevant content based on semantic similarity
- Formats results with similarity scores for transparency
- Includes proper attribution prompting for the model

### Web Scraper Tool

```typescript
webScraper: tool({
  description: 'Analyze web content from a URL to extract detailed information about the photography website',
  parameters: webScraperSchema,
  execute: async ({ url }) => {
    // Call the puppeteer scraper
    const result = await callPuppeteerScraper(url);
    
    // Format and return the content
    return formatScrapedContent(result);
  }
})
```

The Web Scraper tool:
- Extracts content from photography websites for analysis
- Handles URL validation and protocol enforcement
- Uses Puppeteer for robust content extraction
- Formats results in a consistent, readable format

### URL Detection Helper

```typescript
detectAndScrapeUrls: tool({
  description: 'Automatically detects URLs in text and scrapes their content',
  parameters: detectAndScrapeUrlsSchema,
  execute: async ({ text }) => {
    // Extract URLs
    const urls = extractUrls(text);
    
    // Process and return content
    // ...
  }
})
```

This helper tool:
- Finds URLs mentioned in user text
- Validates and processes them automatically
- Returns both the URLs found and their scraped content

## Preprocessing Features

### Deep Search

Deep Search operates as a preprocessing step rather than an AI SDK tool:

1. It's activated based on user toggle in the UI
2. When enabled, it runs before the conversation is sent to the AI
3. Results are embedded directly in the system prompt
4. The AI is made aware of these results but doesn't need to call the tool directly

Benefits of this approach:
- Ensures high-quality information is always available
- Preserves user control over when to use external sources
- Reduces token consumption by avoiding multiple tool calls
- Improves response speed since data is already present

## Tool Selection Strategy

The AI model is instructed to use tools in the following order:

1. First, utilize any preprocessed context (Deep Search results)
2. For photography business questions, use the Knowledge Base tool
3. For website analysis, use the Web Scraper tool
4. When encountering URLs in text, use the URL detection helper

## Tool Registration

Tools are registered in the chat route using the AI SDK pattern:

```typescript
// Add tools to the AI using the AI SDK
let aiSdkTools = {};

try {
  // Dynamically import AI SDK tool utilities
  const { tool } = await import('ai');

  // Convert our tools to AI SDK format
  aiSdkTools = {
    getInformation: tool({ /* ... */ }),
    webScraper: tool({ /* ... */ }),
    detectAndScrapeUrls: tool({ /* ... */ })
  };
} catch (error) {
  edgeLogger.error('Error initializing tools', { error: formatError(error) });
}

// Pass tools to the streamText function
const response = await streamText({
  model: selectedModel,
  messages: aiMessages,
  temperature: 0.7,
  maxTokens: 25000,
  tools: Object.keys(aiSdkTools).length > 0 ? aiSdkTools : undefined
})
```

## Response Validation

To ensure proper attribution, the application validates AI responses to confirm tools are properly acknowledged:

```typescript
const validateResponse = createResponseValidator(toolManager.getToolsUsed());

// Apply validation to ensure tool attribution
const validatedContent = validateResponse(text);
```

The validator:
1. Checks if tool usage is properly attributed in responses
2. Adds appropriate attribution if missing
3. Ensures transparency in how responses are generated

## Benefits of This Approach

1. **Intelligent Tool Selection**: The AI model can dynamically choose which tools to use based on the conversation context.

2. **User Control**: Users maintain control over Deep Search usage through UI toggles.

3. **Optimized Token Usage**: Preprocessing steps reduce unnecessary tool calls, preserving token budget for more complex reasoning.

4. **Enhanced Response Accuracy**: The combination of preprocessed context and on-demand tools provides comprehensive information access.

5. **Flexible Architecture**: The hybrid approach allows for adding new tools or preprocessing steps without major architectural changes.

## Token Limits and Truncation Strategy

The application maximizes the use of GPT-4o's 25K token context window through carefully configured token limits and intelligent content truncation:

### Model Token Configuration

```typescript
// In lib/ai/models.ts
{
  id: 'gpt-4o',
  name: 'GPT-4o',
  description: 'Most capable model for complex tasks',
  maxTokens: 25000,  // Increased from 8192 to utilize full context window
  provider: 'openai'
}
```

### API Request Configuration

```typescript
// In app/api/chat/route.ts
const result = await streamText({
  model: openai('gpt-4o'),
  messages: aiMessages,
  temperature: 0.4,
  maxTokens: 25000,  // Increased to match model capacity
  tools: aiSdkTools,
  maxSteps: 10,
  toolChoice: 'auto'
});
```

### Content Truncation Limits

The system implements intelligent truncation to ensure content fits within token limits while preserving the most important information:

```typescript
// In lib/chat/prompt-builder.ts
const DEFAULT_TRUNCATION_LIMITS: TruncationConfig = {
  ragMaxLength: 15000,       // Increased from 6000 to 15000
  deepSearchMaxLength: 15000, // Increased from 3000 to 15000
  webScraperMaxLength: 20000  // Increased from 5000 to 20000
};
```

These increased limits allow for much more comprehensive context from each source while still ensuring the total content fits within the model's context window. For optimal content preservation, the system uses intelligent extraction rather than simple truncation when possible:

```typescript
// Tool content is intelligently truncated to preserve most relevant parts
if (formattedResult.content.length > 20000) {
  const originalLength = formattedResult.content.length;
  formattedResult.content = truncateContent(formattedResult.content, 20000, 'Web Scraper');
}
```

## Implementation Details

The implementation spans several files:

- `lib/chat/tool-schemas.ts`: Defines the Zod schemas for tool parameters
- `lib/chat/tools.ts`: Implements the tool functionality
- `app/api/chat/route.ts`: Integrates tools within the chat API route
- `lib/chat/response-validator.ts`: Ensures proper tool attribution

## Conclusion

The hybrid approach to AI tooling in the San Diego application combines the flexibility of AI SDK tools with the reliability of preprocessing steps. This architecture ensures that the AI has access to the information it needs while giving it the agency to proactively seek additional information when required.
