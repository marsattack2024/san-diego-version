# Token Limits and Truncation Strategy

This document outlines the optimization of token limits and truncation strategies in the San Diego application to maximize GPT-4o's 25K token context window.

## Recent Optimizations

The following key updates have been implemented to improve context utilization:

1. **GPT-4o Model Configuration**
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

2. **API Request Configuration**
   ```typescript
   // In app/api/chat/route.ts
   const result = await streamText({
     model: openai('gpt-4o'),
     messages: aiMessages,
     temperature: 0.4,
     maxTokens: 25000,  // Increased from 15000 to match model capacity
     tools: aiSdkTools,
     maxSteps: 10,
     toolChoice: 'auto'
   });
   ```

3. **Content Truncation Limits**
   ```typescript
   // In lib/chat/prompt-builder.ts
   const DEFAULT_TRUNCATION_LIMITS: TruncationConfig = {
     ragMaxLength: 15000,        // Increased from 6000
     deepSearchMaxLength: 15000, // Increased from 3000
     webScraperMaxLength: 20000  // Increased from 5000
   };
   ```

4. **Website Summarization**
   ```typescript
   // In lib/agents/tools/website-summarizer.ts
   // Truncate content for faster processing
   const truncatedContent = content.substring(0, 25000); // Increased for more comprehensive analysis
   ```

## Benefits of Increased Limits

These optimizations provide several advantages:

1. **Enhanced Context Awareness**: With 3-5x more context available, the model has access to more comprehensive information from each source, leading to more informed and accurate responses.

2. **Improved Search Depth**: The Knowledge Base RAG system can now include more relevant documents and context (15K characters vs 6K previously).

3. **More Comprehensive Web Analysis**: The Web Scraper can process and utilize larger portions of website content (20K characters vs 5K previously).

4. **Richer Research Results**: Deep Search results include 5x more content than before (15K characters vs 3K previously).

5. **Better Response Generation**: The increased output token limit (25K) allows for more detailed and comprehensive responses, especially for complex queries.

6. **More Accurate Website Summarization**: The website summarizer now processes up to 25K characters of content, creating more comprehensive and accurate business summaries.

## Implementation Strategy

The system implements intelligent truncation using two primary methods:

1. **Simple Truncation with Notice**:
   ```typescript
   export function truncateContent(content: string, maxLength: number, label: string): string {
     if (content.length > maxLength) {
       const truncated = content.substring(0, maxLength);
       return truncated + `\n\n[${label} truncated for brevity. Total length: ${content.length} characters]`;
     }
     return content;
   }
   ```

2. **Smart Content Extraction** (for larger texts):
   ```typescript
   export function extractRelevantContent(content: string, maxLength: number, query: string = ""): string {
     // Intelligent extraction that prioritizes:
     // - Content matching the query
     // - Headers and important structural elements
     // - Beginning portions of each section
     // - High-relevance paragraphs based on keyword matching
     // ...
   }
   ```

## Memory and Performance Considerations

While increasing token limits enhances capabilities, it also affects:

1. **OpenAI API Costs**: Higher token counts increase API costs proportionally
2. **Response Latency**: Larger contexts require more processing time
3. **Memory Usage**: Edge functions must handle larger payloads

To balance these factors, the system:

1. Uses a hybrid approach with preprocessed content and on-demand tool calls
2. Implements intelligent truncation that preserves meaning while reducing size
3. Only includes content that's truly relevant to the user's query

## Conclusion

The optimization of token limits and truncation strategies significantly enhances the San Diego application's ability to provide comprehensive, accurate responses by leveraging the full capabilities of GPT-4o's 25K token context window. 