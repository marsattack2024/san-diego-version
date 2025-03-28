# Agent Prompt Building System

This document provides a comprehensive explanation of the prompt building system used in the San Diego application, detailing how different components are combined to create the final prompt sent to the GPT-4o model.

## 1. Core Components

The prompt building system consists of these key components:

- **Base System Prompt**: Core instructions used by all agents (`BASE_PROMPT`)
- **Agent-Specific Prompts**: Specialized instructions for specific agent types
- **AI SDK Tools**: Knowledge Base and Web Scraper implemented as callable tools
- **Preprocessing Context**: Deep Search results added to system prompt when enabled
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

The updated base prompt (`BASE_PROMPT` from `lib/agents/prompts/base-prompt.ts`) contains instruction for active tool use:

```
You are an AI agent for photography businesses. SPECIALIST PROMPTS (Google Ads, Facebook Ads, Quiz, Copywriting) ALWAYS SUPERSEDE this base prompt.

INFORMATION INTEGRITY:
- NEVER mix information between different photography studios
- ONLY attribute features that are EXPLICITLY documented for a specific studio
- When uncertain, ASK for clarification instead of assuming

AVAILABLE TOOLS - USE THESE PROACTIVELY:
- Knowledge Base: ALWAYS search this first for photography-specific information
- Web Scraper: ALWAYS use this to analyze URLs the user provides or mentions
- Deep Search: Use this information when it's available in the system prompt

TOOL USAGE STRATEGY:
1. For photography marketing questions, FIRST search the Knowledge Base
2. If the user mentions or provides a URL, use Web Scraper to analyze it
3. For current trends or specific questions not in Knowledge Base, refer to Deep Search results if available
4. For complex tasks, combine information from multiple sources

ALWAYS ACKNOWLEDGE TOOLS USED at the end of your response (Knowledge Base, Web Scraper, Deep Search). Be honest if none were used.

[additional instructions...]
```

### 3.2 Enhanced Prompt with Deep Search Results

In `lib/chat/prompt-builder.ts`, the `buildEnhancedSystemPrompt` function now only adds Deep Search results and user profile information to the system prompt:

```typescript
export async function buildEnhancedSystemPrompt(
  basePrompt: string,
  toolResults: ToolResults,
  toolsUsed: string[],
  userId?: string,
  userQuery?: string
): Promise<string> {
  let enhancedSystemPrompt = basePrompt;
  
  // Add Deep Search results when available (from preprocessing)
  if (toolResults.deepSearch && toolsUsed.includes('Deep Search')) {
    enhancedSystemPrompt += `\n\n### DEEP SEARCH RESULTS ###\nThe following information was retrieved through a comprehensive web search using Perplexity:\n\n${toolResults.deepSearch}\n\n`;
    
    // Add specific instructions about how to use the DeepSearch information
    enhancedSystemPrompt += `\nPlease incorporate the Deep Search results appropriately in your response. The information may include current facts, data, or context that can enhance your answer. Use the most relevant parts of these results to support your response when applicable. You may mention that information was retrieved through web search only if it adds value to the response, such as when providing fresh or factual information.\n\n`;
  }

  // Add user profile information if available
  if (userId) {
    try {
      // Fetch user profile data and add to prompt
      // [code that retrieves user profile]
      
      enhancedSystemPrompt += `\n\n### USER PROFILE INFORMATION ###\n${profileContext}\n\n`;
    } catch (error) {
      // Log error and continue without user data
    }
  }
  
  // Add detailed instructions for reporting tools used
  enhancedSystemPrompt += `\n\nIMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
${toolsUsed.map(tool => {
  if (tool === 'Knowledge Base' && toolResults.ragContent) {
    return `- Knowledge Base: Used to retrieve relevant information`;
  }
  if (tool === 'Web Scraper' && toolResults.webScraper) {
    return `- Web Scraper: Used to analyze content from URLs`;
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

## 4. Tool Implementation

The system now uses a hybrid approach for tools:

### 4.1 AI SDK Tools (Knowledge Base and Web Scraper)

These tools are defined in `app/api/chat/route.ts` and passed to the `streamText` function:

```typescript
// Convert our tools to AI SDK format
aiSdkTools = {
  getInformation: tool({
    description: 'Search the internal knowledge base for relevant information',
    parameters: getInformationSchema,
    execute: async ({ query }) => {
      // Implementation that searches vector database
      // ...
    }
  }),

  webScraper: tool({
    description: 'Analyze web content from a URL to extract detailed information',
    parameters: webScraperSchema,
    execute: async ({ url }) => {
      // Implementation that calls puppeteer scraper
      // ...
    }
  }),

  detectAndScrapeUrls: tool({
    description: 'Automatically detects URLs in text and scrapes their content',
    parameters: detectAndScrapeUrlsSchema,
    execute: async ({ text }) => {
      // Implementation that extracts and processes URLs
      // ...
    }
  })
};

// Used in the streamText call
const result = await streamText({
  model: openai('gpt-4o'),
  messages: aiMessages,
  temperature: 0.4,
  maxTokens: 25000,
  tools: aiSdkTools,
  maxSteps: 10,
  toolChoice: 'auto',
  // ...
});
```

### 4.2 Deep Search (Preprocessing)

Deep Search remains a preprocessing step that's controlled by the user toggle:

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
    const deepSearchContent = await callPerplexityAPI(deepSearchQuery);
    
    // Register the result
    toolManager.registerToolResult('Deep Search', deepSearchContent);
  }
}
```

## 5. Response Validation

The response validator ensures that all tool usages are properly reported, whether from explicit AI SDK tool calls or from preprocessing steps:

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

## 6. Example System Prompt

Here's an example system prompt with Deep Search preprocessing:

```
[Base System Prompt with Tool Instructions]

### SPECIALIZED AGENT INSTRUCTIONS (COPYWRITING):
[Copywriting Agent Prompt]
### END SPECIALIZED INSTRUCTIONS ###

### DEEP SEARCH RESULTS ###
The following information was retrieved through a comprehensive web search using Perplexity:

[Deep Search Content - 1998 characters]

Please incorporate the Deep Search results appropriately in your response. The information may include current facts, data, or context that can enhance your answer. Use the most relevant parts of these results to support your response when applicable. You may mention that information was retrieved through web search only if it adds value to the response, such as when providing fresh or factual information.

### USER PROFILE INFORMATION ###
[User's Photography Business Profile]

IMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
- Knowledge Base: Used to retrieve relevant information
- Web Scraper: Used to analyze content from URLs
- Deep Search: Retrieved 1998 characters of additional context through web search

This section is REQUIRED and must be included at the end of EVERY response.
```

## 7. Implementation Details

### 7.1 Key Files

- `lib/agents/prompts/base-prompt.ts`: Contains the updated base system prompt with tool instructions
- `lib/agents/prompts/index.ts`: Functions to build and combine prompts
- `lib/chat/prompt-builder.ts`: Functions to build the complete system prompt with Deep Search context
- `lib/chat/response-validator.ts`: Validates and corrects AI responses
- `lib/chat/tool-schemas.ts`: Defines Zod schemas for the AI SDK tools
- `lib/chat/tools.ts`: Core implementations of tools
- `app/api/chat/route.ts`: Coordinates the entire process including tool registration and preprocessing

### 7.2 Tool Information Flow

The hybrid approach follows this workflow:

1. **Deep Search (when enabled)**:
   - Pre-executed before LLM call based on user toggle
   - Results embedded in system prompt
   - AI instructed to use this context

2. **Knowledge Base & Web Scraper**:
   - Registered as AI SDK tools
   - Called by the model during generation as needed
   - Results integrated into the response

### 7.3. Benefits of Hybrid Approach

The hybrid approach offers several advantages:

1. **User Control**: Deep Search is only executed when explicitly enabled
2. **Dynamic Knowledge Base Access**: AI can retrieve specific information when needed
3. **On-Demand Web Content Analysis**: AI can analyze URLs mentioned anywhere in the conversation
4. **Token Efficiency**: Only relevant information is included in the context
5. **Flexibility**: Combines best of both preprocessing and on-demand tool use

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
  maxTokens: 25000,   // Limits the response (completion) tokens
  tools: aiSdkTools,
  maxSteps: 10,
  // ...
});
```

### 8.2 Content Truncation Strategy

Deep Search content is truncated to fit within token limits:

```typescript
// From lib/chat/prompt-builder.ts
const DEFAULT_TRUNCATION_LIMITS: TruncationConfig = {
  ragMaxLength: 15000,       // Increased from 6000 to 15000
  deepSearchMaxLength: 15000, // Increased from 3000 to 15000
  webScraperMaxLength: 20000  // Increased from 5000 to 20000
};
```

For AI SDK tools like Knowledge Base and Web Scraper, truncation happens within the tool implementations to ensure responses fit within reasonable limits.

### 8.3 Smart Content Extraction

For Deep Search results (preprocessed), the system uses advanced techniques to extract the most relevant parts:

```typescript
export function extractRelevantContent(content: string, maxLength: number, query: string = ""): string {
  // Intelligent scoring and extraction logic
  // ...
}
```

For Knowledge Base and Web Scraper tools, the model itself can request only the specific information it needs, improving context efficiency.

## 9. Conclusion

The hybrid approach combines the benefits of preprocessing (Deep Search) with dynamic AI SDK tools (Knowledge Base, Web Scraper):

- Deep Search provides extensive web research when enabled by users
- Knowledge Base tool allows precise information retrieval during conversation
- Web Scraper tool enables URL analysis anywhere in the conversation
- System prompt guides tool selection based on query type
- Response validation ensures proper documentation of tool usage

This approach optimizes both user control and AI flexibility, creating a more dynamic and effective experience.
