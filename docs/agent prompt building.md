# Agent Prompt Building System

This document provides a comprehensive explanation of the prompt building system used in the San Diego application, detailing how different components are combined to create the final prompt sent to the GPT-4o model.

## 1. Core Components

The prompt building system consists of these key components:

- **Base System Prompt**: Core instructions used by all agents (`BASE_PROMPT`)
- **Agent-Specific Prompts**: Specialized instructions for specific agent types
- **Content Context**: Results from RAG, Web Scraper, and Deep Search
- **User Profile Context**: Information about the user's photography business
- **Required Sections Instruction**: Requirement to include specific sections (like tools used)

## 2. Agent Selection Process

### 2.1 Agent Types

The system supports these specialized agents:

```typescript
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';
```

### 2.2 Routing Algorithm

In `lib/agents/agent-router.ts`, the `routeMessage` method determines which agent to use:

```typescript
routeMessage(selectedAgentId: AgentType, messages: Message[]): AgentType {
  // If user has explicitly selected a non-default agent, use that
  if (selectedAgentId !== 'default') {
    return selectedAgentId;
  }

  // Get the last user message
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return 'default';
  }

  const content = lastMessage.content.toLowerCase();
  
  // Skip for short queries or question-style queries
  if (content.length < 15 || content.startsWith('what') || /* other checks */) {
    return 'default';
  }

  // Score each agent based on keywords
  const scores = { 'default': 0, 'copywriting': 0, /* other agents */ };
  
  // Check for relevant keywords
  for (const [agentType, keywords] of Object.entries(AGENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (content.includes(keyword.toLowerCase())) {
        // Multi-word keywords get higher scores
        const wordCount = keyword.split(' ').length;
        const score = wordCount * 2;
        scores[agentType as AgentType] += score;
        
        // Bonus points for keywords at the beginning
        if (content.startsWith(keyword.toLowerCase())) {
          scores[agentType as AgentType] += 5;
        }
        
        // Bonus points for exact phrase matches
        if (new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i').test(content)) {
          scores[agentType as AgentType] += 3;
        }
      }
    }
  }

  // Find agent with highest score
  let highestScore = 0;
  let selectedAgent: AgentType = 'default';
  for (const [agentType, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      selectedAgent = agentType as AgentType;
    }
  }

  // Route to specialized agent if score exceeds threshold
  const routingThreshold = 5;
  if (highestScore >= routingThreshold) {
    return selectedAgent;
  }
  
  return 'default';
}
```

Example from logs:
```
🔵 21:27:17 Agent routing scores
  scores={"default":0,"copywriting":7,"google-ads":0,"facebook-ads":0,"quiz":0}
  
🔵 21:27:17 Agent routing decision
  originalAgentId=default
  finalAgentId=copywriting
  wasAutoRouted=true
  method=auto-routing
```

## 3. Building the System Prompt

### 3.1 Base Prompt + Agent-Specific Prompt

First, in `lib/agents/prompts/index.ts`, the `buildSystemPrompt` function creates the foundation:

```typescript
export function buildSystemPrompt(agentType: AgentType): string {
  // Start with the base prompt that applies to all agents
  let prompt = BASE_PROMPT;
  
  // If this is a specialized agent, add its specific prompt
  if (agentType !== 'default') {
    const specializedPrompt = AGENT_PROMPTS[agentType];
    prompt += `\n\n### SPECIALIZED AGENT INSTRUCTIONS (${agentType.toUpperCase()}):\n\n${specializedPrompt}\n\n### END SPECIALIZED INSTRUCTIONS ###\n\nRemember to follow both the base instructions above and these specialized instructions for your role.`;
  }
  
  return prompt;
}
```

The base prompt (`BASE_PROMPT` from `lib/agents/prompts/base-prompt.ts`) contains universal instructions:

```
You are an AI agent for photography businesses. SPECIALIST PROMPTS (Google Ads, Facebook Ads, Quiz, Copywriting) ALWAYS SUPERSEDE this base prompt.

INFORMATION INTEGRITY:
- NEVER mix information between different photography studios
- ONLY attribute features that are EXPLICITLY documented for a specific studio
- When uncertain, ASK for clarification instead of assuming

AVAILABLE TOOLS AND RESOURCES:
- Knowledge Base (documentation and examples)
- Web Scraper (for website content)
- Deep Search (for comprehensive research)
- Client's unique studio attributes

ALWAYS ACKNOWLEDGE RESOURCES USED at the end of your response (Knowledge Base, Web Scraper, Deep Search). Be honest if none were used.

Core Principles:
1. Clear, readable formatting with proper spacing
2. Actionable, specific advice with concrete examples
3. Utilize all available tools and context
4. Align with studio's voice and photography best practices
5. Research thoroughly using all available sources
6. Maintain professional but friendly tone
7. Generate original, never plagiarized content

[additional instructions...]
```

### 3.2 Enhanced Prompt with Tool Results

In `lib/chat/prompt-builder.ts`, the `buildEnhancedSystemPrompt` function adds tool results in priority order:

```typescript
export async function buildEnhancedSystemPrompt(
  basePrompt: string,
  toolResults: ToolResults,
  toolsUsed: string[],
  userId?: string,
  userQuery?: string
): Promise<string> {
  let enhancedSystemPrompt = basePrompt;
  
  // 1. Add RAG results at the top - highest priority context
  if (toolResults.ragContent && toolsUsed.includes('Knowledge Base')) {
    enhancedSystemPrompt += `\n\n### KNOWLEDGE BASE RESULTS ###\nThe following information was retrieved from the knowledge base and is highly relevant to the query:\n\n${toolResults.ragContent}\n\n`;
  }
  
  // 2. Add web scraper results - medium priority context
  if (toolResults.webScraper && toolsUsed.includes('Web Scraper')) {
    enhancedSystemPrompt += `\n\n### WEB SCRAPER RESULTS ###\nI have scraped the following content directly from the requested web pages. This is authoritative content from the source and should be used as the primary basis for your response when answering questions about these pages:\n\n${toolResults.webScraper}\n\nIMPORTANT: When discussing content from these web pages, use the actual information provided above rather than making assumptions or using general knowledge. If the content contains specific details, numbers, quotes, or facts, include those in your response.\n\n`;
  }
  
  // 3. Add Deep Search results - useful additional context
  if (toolResults.deepSearch && toolsUsed.includes('Deep Search')) {
    enhancedSystemPrompt += `\n\n### DEEP SEARCH RESULTS ###\nThe following information was retrieved through a comprehensive web search using Perplexity:\n\n${toolResults.deepSearch}\n\n`;
    
    // Add specific instructions about how to use the DeepSearch information
    enhancedSystemPrompt += `\nPlease incorporate the Deep Search results appropriately in your response. The information may include current facts, data, or context that can enhance your answer. Use the most relevant parts of these results to support your response when applicable. You may mention that information was retrieved through web search only if it adds value to the response, such as when providing fresh or factual information.\n\n`;
  }

  // 4. Add user profile information if available
  if (userId) {
    try {
      // Fetch user profile data and add to prompt
      // [code that retrieves user profile]
      
      enhancedSystemPrompt += `\n\n### USER PROFILE INFORMATION ###\n${profileContext}\n\n`;
    } catch (error) {
      // Log error and continue without user data
    }
  }
  
  // 5. Add detailed instructions for reporting tools used
  enhancedSystemPrompt += `\n\nIMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
${toolsUsed.map(tool => {
  if (tool === 'Knowledge Base' && toolResults.ragContent) {
    return `- Knowledge Base: Retrieved ${toolResults.ragContent.length} characters of relevant information`;
  }
  if (tool === 'Web Scraper' && toolResults.webScraper) {
    return `- Web Scraper: Analyzed content with ${toolResults.webScraper.length} characters`;
  }
  if (tool === 'Deep Search' && toolResults.deepSearch) {
    return `- Deep Search: Retrieved ${toolResults.deepSearch.length} characters of additional context through web search`;
  }
  return `- ${tool}: No content retrieved`;
}).join('\n')}

This section is REQUIRED and must be included at the end of EVERY response.`;
  
  return enhancedSystemPrompt;
}
```

## 4. Tool Execution and Integration

Tools are executed in a specific priority order in `app/api/chat/route.ts`:

### 4.1 RAG (Knowledge Base) - HIGH PRIORITY
```typescript
// From app/api/chat/route.ts
// 2. RAG (Knowledge Base) - HIGH PRIORITY for queries over 15 characters
if (lastUserMessage.content.length > 15) {
  try {
    const ragResult = await chatTools.getInformation.execute(
      { query: lastUserMessage.content },
      { toolCallId: 'rag-search', messages: [] }
    );
    
    // If successful, register the tool result
    if (!ragContent.includes("No relevant information found")) {
      toolManager.registerToolResult('Knowledge Base', ragContent);
      // Log success...
    }
  } catch (error) {
    // Log error...
  }
}
```

### 4.2 Web Scraper - MEDIUM PRIORITY
```typescript
// URLs are detected in the user's message
const urls = extractUrls(lastUserMessage.content);

if (urls.length > 0) {
  // Process each URL with the puppeteer scraper
  // ...
  toolManager.registerToolResult('Web Scraper', scrapedContent);
}
```

### 4.3 Deep Search (Perplexity) - LOWEST PRIORITY
```typescript
// Only run if explicitly enabled
if (deepSearchEnabled === true) {
  // Skip if we already have substantial content from other tools
  const toolResults = toolManager.getToolResults();
  const ragContentLength = toolResults.ragContent?.length || 0;
  const webScraperLength = toolResults.webScraper?.length || 0;
  const hasExtensiveContent = ragContentLength > 5000 && webScraperLength > 8000;
  
  if (!hasExtensiveContent) {
    // Run Deep Search...
    toolManager.registerToolResult('Deep Search', deepSearchContent);
  }
}
```

## 5. Response Validation

After the response is generated, it's validated in `lib/chat/response-validator.ts` to ensure all used tools are properly mentioned:

```typescript
export function createResponseValidator(config: ResponseValidationConfig) {
  const { toolsUsed, toolResults } = config;
  
  return (response: string): string => {
    // Check if response includes tools used section
    const toolsUsedSection = response.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);
    
    // If missing, add the section
    if (!toolsUsedSection) {
      return response + `\n\n--- Tools and Resources Used ---\n${/* format tools */}`;
    }
    
    // Check if all tools are mentioned
    const sectionContent = toolsUsedSection[1];
    const missingTools = [];
    
    for (const tool of toolsUsed) {
      if (!sectionContent.includes(tool)) {
        missingTools.push(tool);
      }
    }
    
    // If tools are missing, fix the section
    if (missingTools.length > 0) {
      // Replace the section with a corrected version
      // ...
    }
    
    return response;
  };
}
```

Example from logs:
```
🟠 21:26:33 Response missing some tools in Tools and Resources Used section
  missingTools=[Knowledge Base]
  sectionContent=None
  level=warn
🔵 21:26:33 Fixed response with validation function
  originalLength=372
  validatedLength=437
  wasModified=true
```

## 6. Complete Prompt Examples

### 6.1 Example: RAG-Only Prompt

```
[Base System Prompt]

### SPECIALIZED AGENT INSTRUCTIONS (COPYWRITING):
[Copywriting Agent Prompt]
### END SPECIALIZED INSTRUCTIONS ###

Remember to follow both the base instructions above and these specialized instructions for your role.

### KNOWLEDGE BASE RESULTS ###
The following information was retrieved from the knowledge base and is highly relevant to the query:

Found 5 most relevant documents (out of 5 retrieved, average similarity of top 3: 83%):

[Knowledge Base Content - 3081 characters]

### USER PROFILE INFORMATION ###
[User's Photography Business Profile]

IMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
- Knowledge Base: Retrieved 3081 characters of relevant information

This section is REQUIRED and must be included at the end of EVERY response.
```

### 6.2 Example: Combined RAG and Web Scraper

```
[Base System Prompt]

### SPECIALIZED AGENT INSTRUCTIONS (GOOGLE-ADS):
[Google Ads Agent Prompt]
### END SPECIALIZED INSTRUCTIONS ###

Remember to follow both the base instructions above and these specialized instructions for your role.

### KNOWLEDGE BASE RESULTS ###
The following information was retrieved from the knowledge base and is highly relevant to the query:

[Knowledge Base Content]

### WEB SCRAPER RESULTS ###
I have scraped the following content directly from the requested web pages. This is authoritative content from the source and should be used as the primary basis for your response when answering questions about these pages:

[Web Scraper Content]

IMPORTANT: When discussing content from these web pages, use the actual information provided above rather than making assumptions or using general knowledge. If the content contains specific details, numbers, quotes, or facts, include those in your response.

### USER PROFILE INFORMATION ###
[User's Photography Business Profile]

IMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
- Knowledge Base: Retrieved 3079 characters of relevant information
- Web Scraper: Analyzed content with 2958 characters

This section is REQUIRED and must be included at the end of EVERY response.
```

### 6.3 Example: Combined RAG, Web Scraper, and Deep Search

```
[Base System Prompt]

### KNOWLEDGE BASE RESULTS ###
[Knowledge Base Content - 3085 characters]

### WEB SCRAPER RESULTS ###
[Web Scraper Content]

### DEEP SEARCH RESULTS ###
The following information was retrieved through a comprehensive web search using Perplexity:

[Deep Search Content - 1998 characters]

Please incorporate the Deep Search results appropriately in your response. The information may include current facts, data, or context that can enhance your answer. Use the most relevant parts of these results to support your response when applicable. You may mention that information was retrieved through web search only if it adds value to the response, such as when providing fresh or factual information.

### USER PROFILE INFORMATION ###
[User's Photography Business Profile]

IMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
- Knowledge Base: Retrieved 3085 characters of relevant information
- Web Scraper: Analyzed content with 1245 characters
- Deep Search: Retrieved 1998 characters of additional context through web search

This section is REQUIRED and must be included at the end of EVERY response.
```

## 7. Implementation Details

### 7.1 Key Files

- `lib/agents/prompts/base-prompt.ts`: Contains the base system prompt used by all agents
- `lib/agents/prompts/copywriting-prompts.ts` (and similar): Specialized agent prompts
- `lib/agents/prompts/index.ts`: Functions to build and combine prompts
- `lib/agents/agent-router.ts`: Agent selection logic
- `lib/chat/prompt-builder.ts`: Functions to build the complete system prompt with context
- `lib/chat/response-validator.ts`: Validates and corrects AI responses
- `app/api/chat/route.ts`: Coordinates the entire process and tool execution

### 7.2 Information Prioritization

The system uses a strict priority order for information:
1. Base prompt + Agent-specific instructions (foundation)
2. Knowledge Base (RAG) results (highest priority context)
3. Web Scraper results (medium priority context)
4. Deep Search results (lowest priority context)
5. User profile information (personalization)

### 7.3 Content Optimization

Large content is intelligently extracted or truncated to fit token limits:

```typescript
// From lib/chat/prompt-builder.ts
export function extractRelevantContent(content: string, maxLength: number, query: string = ""): string {
  // Intelligent content extraction logic
  // Prioritizes content based on relevance to the query
  // ...
}
```

### 7.4 Validation Process

The response validator ensures the "Tools and Resources Used" section is always present and accurate, correcting it if needed.

## 8. Token Limits and Context Window Management

The application is designed to work within the token limits of various LLMs, with a primary focus on GPT-4o. The system includes several mechanisms to ensure prompts remain within token limits while maximizing the use of available context.

### 8.1 Model Token Limits

As defined in `lib/ai/models.ts`, the system works with the following model limits:

```typescript
export const chatModels: ChatModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model for complex tasks',
    maxTokens: 25000,    // Primary model - 25K context window
    provider: 'openai'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and efficient for most tasks',
    maxTokens: 4096,    // Backup model - 4K context window
    provider: 'openai'
  },
  // Additional models...
];
```

In API requests, the context window usage is managed by setting specific token limits:

```typescript
// From app/api/chat/route.ts
const result = await streamText({
  model: openai('gpt-4o'),
  messages: aiMessages,
  temperature: 0.4,
  maxTokens: 15000,   // Limits the response (completion) tokens
  tools: aiSdkTools,
  // ...
});
```

### 8.2 Content Truncation Strategy

To ensure that tool results fit within token limits, the system uses intelligent truncation strategies:

```typescript
// From lib/chat/prompt-builder.ts
const DEFAULT_TRUNCATION_LIMITS: TruncationConfig = {
  ragMaxLength: 15000,        // Knowledge Base content limit (increased from 6000)
  deepSearchMaxLength: 15000, // Deep Search content limit (increased from 3000)
  webScraperMaxLength: 20000  // Web Scraper content limit (increased from 5000)
};
```

These limits ensure that the total context stays within model token limitations while prioritizing the most relevant information from each source.

### 8.3 Smart Content Extraction

Rather than simple truncation, the system uses advanced techniques to extract the most relevant parts of content:

```typescript
export function extractRelevantContent(content: string, maxLength: number, query: string = ""): string {
  // ...
  // For extremely large content, perform pre-truncation
  const MAX_SAFE_PROCESSING_LENGTH = 150000;
  
  // Split content into sections and score by relevance to query
  const scoredSections = sections.map((section, index) => {
    let score = 0;
    
    // Higher score for earlier sections
    score += Math.max(0, 10 - (index * 0.5));
    
    // If we have a query, check for keyword matches
    if (query) {
      const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
      keywords.forEach(keyword => {
        const matches = (section.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
        score += matches * 2;
      });
    }
    
    // Additional scoring logic...
    
    return { section, score };
  });
  
  // Sort and select highest-scored sections
  // ...
}
```

This approach ensures that the most query-relevant information is preserved when truncation is necessary.

### 8.4 Priority-Based Context Building

When combining multiple information sources, the system allocates context space according to priority:

1. Essential system instructions (base prompt + agent instructions) - Always included
2. Knowledge Base (RAG) results - Highest priority (15,000 character limit)
3. Web Scraper results - Medium priority (20,000 character limit)
4. Deep Search results - Lowest priority (15,000 character limit)
5. User Profile - Small, typically always included

### 8.5 Response Size Management

The system also manages the size of AI responses:

```typescript
// In the chat UI component
const isLargeMessage = contentLength > 100000; // ~100KB threshold

// If message is very large, trim it to prevent database issues
const trimmedContent = isLargeMessage
  ? message.content.substring(0, 100000) + `\n\n[Content truncated due to size. Original length: ${contentLength} characters]`
  : message.content;
```

This prevents excessive token usage and ensures that responses can be properly stored and displayed.

## 9. Conclusion

The agent prompt building system creates comprehensive, context-rich prompts that combine:
- Tailored instructions based on query type
- Relevant information from multiple sources
- User-specific context
- Explicit instructions for output formatting

This approach ensures responses are specific, accurate, and transparent about the information sources used.
