# Agent Tools Implementation

This document provides a comprehensive overview of how tools are implemented in the San Diego application, with a focus on the AI SDK integration and tool calling capabilities.

## Architecture Overview

Our application uses a hybrid approach for tools:

1. **AI SDK Tools**: Implemented using Vercel AI SDK's tool framework, allowing the model to call tools dynamically based on user queries.
2. **Deep Search**: Implemented as a preprocessing step controlled by user toggles.

This hybrid architecture provides the optimal balance between model autonomy and controlled preprocessing.

## AI SDK Tools

### Knowledge Base Tool

The Knowledge Base tool allows the model to search our vector database for relevant information about photography business topics.

```typescript
getInformation: tool({
  description: 'Search the photography knowledge base for relevant information on marketing and business topics',
  parameters: getInformationSchema,
  execute: async ({ query }) => {
    // Implementation that searches the vector database
    const result = await chatTools.getInformation.execute({ query }, {
      toolCallId: 'ai-initiated-kb-search',
      messages: []
    });
    
    return result;
  }
})
```

### Web Scraper Tool

The Web Scraper tool allows the model to extract content from URLs mentioned by the user.

```typescript
webScraper: tool({
  description: 'Scrape and extract content from a webpage to get detailed information from the specified URL',
  parameters: webScraperSchema,
  execute: async ({ url }) => {
    // Implementation that calls the Puppeteer scraper
    const { callPuppeteerScraper, validateAndSanitizeUrl } = await import('@/lib/agents/tools/web-scraper-tool');
    const { ensureProtocol } = await import('@/lib/chat/url-utils');
    
    const fullUrl = ensureProtocol(url);
    const validUrl = validateAndSanitizeUrl(fullUrl);
    
    // Check Redis cache first
    // If not in cache, call the Puppeteer scraper
    const scraperResult = await callPuppeteerScraper(validUrl);
    
    // Format the result for the AI
    const formattedContent = formatScrapedContent(scraperResult);
    
    return formattedContent;
  }
})
```

## Preprocessing Features

### Deep Search

Deep Search is implemented as a preprocessing step rather than an AI SDK tool. This is because:

1. It's controlled by explicit user toggles
2. It requires substantial preprocessing time
3. Results are better embedded directly in the system prompt

```typescript
// Deep Search preprocessing
if (deepSearchEnabled) {
  const deepSearchResults = await performDeepSearch(query);
  enhancedPrompt += deepSearchResults;
}
```

## Tool Selection Strategy

The model follows a specific strategy for tool selection:

1. Use the **Knowledge Base** tool for general photography business questions
2. Use the **Web Scraper** tool when URLs are mentioned in the query or when information about specific websites is needed
3. Use **Deep Search** results (when enabled) for broader web research questions

## URL Detection and Hinting

Rather than preprocessing URLs by default, we now hint to the model that URLs were detected:

```typescript
if (urls.length > 0) {
  aiMessages[0].content += `\n\n${'='.repeat(80)}\n` +
    `## NOTE: URLS DETECTED IN USER MESSAGE\n` +
    `The user message contains the following URLs that may be relevant to their query:\n` +
    urls.map(url => `- ${url}`).join('\n') + `\n` +
    `You can use the webScraper tool to get content from these URLs if needed for your response.\n` +
    `${'='.repeat(80)}\n\n`;
}
```

This approach gives the model more flexibility to decide when scraping is necessary.

## Tool Registration in Chat Route

Tools are registered in the chat route:

```typescript
const aiSdkTools = {
  getInformation: tool({ /* ... */ }),
  webScraper: tool({ /* ... */ }),
  detectAndScrapeUrls: tool({ /* ... */ })
};

// Use the tools in AI SDK
const result = await streamText({
  model: openai('gpt-4o'),
  messages: aiMessages,
  tools: aiSdkTools,
  maxSteps: 10,
  toolChoice: 'auto',
  // ...
});
```

## Benefits of This Approach

1. **Intelligent Tool Selection**: The model decides when to use tools based on the query's needs
2. **User Control**: Deep Search remains explicitly controlled by user toggles
3. **Optimized Token Usage**: URLs are only scraped when necessary, saving tokens for complex queries
4. **Enhanced Response Accuracy**: The model can choose to scrape specific URLs rather than all detected ones

## Cross-Application Tool Sharing

The same tool implementations are used across:

1. Main chat interface
2. Website summarizer
3. Widget chat

This ensures consistent behavior and simplifies maintenance.
