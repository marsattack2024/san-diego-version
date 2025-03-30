# Agent Routing Implementation with Vercel AI SDK

This document outlines the implementation of our agent routing system, which follows the exact pattern described in the Vercel AI SDK documentation.

## Overview

Our application supports multiple specialized agents, each with particular expertise in different domains. The agent router uses AI-powered content classification to automatically select the most appropriate agent based on message content analysis, following the routing pattern recommended by the Vercel AI SDK.

## Agent Types

The system supports the following specialized agents:

1. **Default Agent**: General marketing assistant for photographers
2. **Copywriting Agent**: Specialized in website, email, and marketing copy
3. **Google Ads Agent**: Expert in creating and optimizing Google Ads campaigns
4. **Facebook Ads Agent**: Focused on social media advertising strategies
5. **Quiz Agent**: Creates interactive quizzes and questionnaires for lead generation

## Routing Architecture

Our routing system follows the Vercel AI SDK routing pattern:

### LLM-Based Classification

Following Vercel AI SDK's routing pattern, we use the `generateObject` function with a Zod schema to classify the message content:

```typescript
const routingResult = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: agentRoutingSchema,
  prompt: `Analyze this user message and determine which specialized agent should handle it:
      
  "${message}"
  
  Select from these agent types:
  - default: General marketing assistant for photographers
  - copywriting: Specialized in website, email, and marketing copy
  - google-ads: Expert in creating and optimizing Google Ads campaigns
  - facebook-ads: Focused on social media advertising strategies
  - quiz: Creates interactive quizzes and questionnaires for lead generation
  
  Provide detailed reasoning for your selection.`,
  temperature: 0.1
});
```

The schema defines the expected response format using Zod:

```typescript
export const agentRoutingSchema = z.object({
  reasoning: z.string().describe('Reasoning for why this agent type is most appropriate'),
  agentType: z.enum(['default', 'copywriting', 'google-ads', 'facebook-ads', 'quiz'])
    .describe('The type of agent that should handle this query')
});
```

This follows the exact example in the Vercel AI SDK documentation where they use `generateObject` to classify inputs.

### Manual Agent Selection

The router also supports manually selected agents, detected by checking if the current agent type is not 'default':

```typescript
// If a specific agent is already selected (not default), keep using it
if (currentAgentType !== 'default') {
    edgeLogger.info('Using explicitly selected agent', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'agent_routing',
        requestedAgent: currentAgentType,
        selectedAgent: currentAgentType,
        selectionMethod: 'user-selected'
    });

    return {
        agentType: currentAgentType,
        config: getAgentConfig(currentAgentType)
    };
}
```

## Agent-Specific Configuration

Each agent type has a dedicated configuration that includes:

```typescript
function getAgentConfig(agentType: AgentType): AgentConfig {
  // Get system prompt using the prompts module
  const systemPrompt = buildSystemPrompt(agentType);

  // Map agent types directly to configurations 
  // Following Vercel's pattern of direct mapping based on classification
  const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
    'copywriting': {
      temperature: 0.7, // More creative for copywriting
      model: 'gpt-4o',
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: true,
        useDeepSearch: true,
        useRagTool: true
      }
    },
    'google-ads': {
      temperature: 0.4, // More focused for ads
      model: 'gpt-4o',
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: true,
        useDeepSearch: true,
        useRagTool: true
      }
    },
    'facebook-ads': {
      temperature: 0.4, // More focused for ads
      model: 'gpt-4o',
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: true,
        useDeepSearch: true,
        useRagTool: true
      }
    },
    'quiz': {
      temperature: 0.6, // Balanced creativity for quiz creation
      model: 'gpt-4o',
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: false, // Reduced tool set for quiz agent
        useDeepSearch: false,
        useRagTool: true
      }
    },
    'default': {
      temperature: 0.5, // Balanced temperature for general purposes
      model: 'gpt-4o',
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: true,
        useDeepSearch: true, // Allow deep search by default
        useRagTool: true
      }
    }
  };

  return {
    systemPrompt,
    ...configurations[agentType]
  };
}
```

## Integration with Chat Engine

The agent routing system integrates with our chat engine architecture in the route handler with enhanced logging and error handling:

```typescript
// Detect the appropriate agent type based on message content
try {
  var { agentType, config: agentConfig, reasoning } = await detectAgentType(
    lastUserMessage.content as string,
    requestedAgentId as any
  );

  // Log agent selection with detailed information
  edgeLogger.info('Agent type detected', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'agent_detection',
    sessionId,
    requestedAgent: requestedAgentId,
    detectedAgent: agentType,
    selectionMethod: requestedAgentId === 'default' ? 'automatic' : 'user-selected',
    reason: reasoning ? reasoning.substring(0, 150) + (reasoning.length > 150 ? '...' : '') : undefined,
    messagePreview: (lastUserMessage.content as string).substring(0, 50) + '...',
    messageTokenCount: (lastUserMessage.content as string).length / 4 // Rough estimate
  });
} catch (agentError) {
  edgeLogger.error('Agent detection failed', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'agent_detection',
    sessionId,
    error: agentError instanceof Error ? agentError.message : String(agentError),
    requestedAgent: requestedAgentId,
    fallbackAgent: 'default',
    important: true
  });

  return new Response(
    JSON.stringify({
      error: 'Agent detection failed',
      message: agentError instanceof Error ? agentError.message : 'Unknown error'
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}

// Determine if this agent type can use Deep Search
const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;

// Only enable Deep Search if both the user has toggled it AND the agent supports it
const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

// Create tools object with conditional inclusion of Deep Search
try {
  var tools = createToolSet({
    useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
    useWebScraper: agentConfig.toolOptions.useWebScraper,
    useDeepSearch: shouldUseDeepSearch // Only include if explicitly enabled
  });

  edgeLogger.info('Tool selection', {
    operation: 'tool_selection',
    toolNames: Object.keys(tools),
    deepSearchEnabled,
    shouldUseDeepSearch,
    deepSearchIncluded: 'deepSearch' in tools
  });
} catch (toolError) {
  edgeLogger.error('Tool creation failed', {
    operation: 'tool_creation',
    error: toolError instanceof Error ? toolError.message : String(toolError)
  });

  return new Response(
    JSON.stringify({
      error: 'Tool creation failed',
      message: toolError instanceof Error ? toolError.message : 'Unknown error'
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

## Detailed Reasoning and Logging

The router implementation includes comprehensive logging for debugging and analytics:

```typescript
// Inside detectAgentType function
const selectedAgent = routingResult.object.agentType as AgentType;
const reasoning = routingResult.object.reasoning;

// Log the AI routing decision with detailed reasoning
edgeLogger.info('Agent routing decision', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'agent_routing_decision',
    requestedAgent: 'default',
    selectedAgent,
    selectionMethod: 'automatic',
    reasoning: reasoning.substring(0, 150) + (reasoning.length > 150 ? '...' : ''),
    keywordScores: {}, // Could be populated if using keyword scoring
    confidenceScore: 1.0 // Could be calculated if using confidence scoring
});

return {
    agentType: selectedAgent,
    config: getAgentConfig(selectedAgent),
    reasoning
};
```

## Prompt System Integration

Agent routing integrates with our prompt system to provide specialized prompts for each agent:

```typescript
// In lib/chat-engine/prompts/index.ts
export const AGENT_PROMPTS: Record<AgentType, string> = {
  'default': '',  // No additional prompt for default agent
  'copywriting': COPYWRITING_SYSTEM_PROMPT,
  'google-ads': GOOGLE_ADS_SYSTEM_PROMPT,
  'facebook-ads': FACEBOOK_ADS_SYSTEM_PROMPT,
  'quiz': QUIZ_SYSTEM_PROMPT
};

// Base prompt builder
export function buildSystemPrompt(agentType: AgentType): string {
  // Start with the base prompt that applies to all agents
  let systemPrompt = BASE_PROMPT;

  // If this is a specialized agent, add its specific prompt
  if (agentType !== 'default' && AGENT_PROMPTS[agentType]) {
    systemPrompt += `\n\n${AGENT_PROMPTS[agentType]}`;
  }

  return systemPrompt;
}

// Enhanced prompt builder with tool instructions
export function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string {
  // Get the base system prompt for the agent type
  const basePrompt = buildSystemPrompt(agentType);

  // Add tool descriptions
  const withToolDescription = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following resources:\n` +
    `- Knowledge Base: Retrieve information from our internal knowledge base\n` +
    `- Web Scraper: Extract content from specific URLs provided by the user\n` +
    `- Deep Search: Conduct in-depth research on complex topics using Perplexity AI\n\n` +
    `Use these resources when appropriate to provide accurate and comprehensive responses.`;

  // Add DeepSearch-specific instructions based on whether it's enabled
  const deepsearchInstructions = deepSearchEnabled
    ? `### DEEP SEARCH INSTRUCTIONS:\n\n` +
      `DeepSearch is enabled for this conversation. When you use the deepSearch tool:\n` +
      `1. You MUST directly incorporate the information retrieved from Deep Search into your response\n` +
      `2. You MUST clearly attribute information from Deep Search by beginning sentences with phrases like 'According to Deep Search results...' or 'Web search results indicate...'\n` +
      `3. You MUST always prefer Deep Search results over your pre-existing knowledge when answering factual questions\n` +
      `4. For questions seeking current information (news, sports, etc.), ALWAYS use the deepSearch tool\n` +
      `5. Break down complex questions into smaller parts and use the deepSearch tool for each part if necessary\n` +
      `6. When citing specific information, include the source name and URL when available in the format: (Source: [name], URL: [url])`
    : `NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool.`;
  
  // Add attribution section
  const attributionSection = `### ATTRIBUTION FORMAT:\n\n` +
    `At the end of your response, you MUST include a section that explicitly states which resources you used ` +
    `(Knowledge Base, Web Scraper, or Deep Search). Format this section as:\n\n` +
    `---\n` +
    `Resources used: [list resources]\n` +
    `[If Deep Search was used: Brief summary of key information retrieved with source attribution]\n` +
    `---`;

  return `${withToolDescription}\n\n${deepsearchInstructions}\n\n${attributionSection}`;
}
```

## Error Handling and Fallback

The system includes robust error handling and fallback mechanisms:

```typescript
try {
  // Use AI to classify the message
  const routingResult = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: agentRoutingSchema,
    // Prompt template...
  });
  
  return {
    agentType: routingResult.object.agentType as AgentType,
    config: getAgentConfig(routingResult.object.agentType as AgentType),
    reasoning: routingResult.object.reasoning
  };
} catch (error) {
  // If AI routing fails, fall back to default agent
  edgeLogger.error('AI agent routing failed, falling back to default agent', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'agent_routing_fallback',
    requestedAgent: 'default',
    selectedAgent: 'default',
    selectionMethod: 'automatic',
    error: error instanceof Error ? error.message : String(error),
    reason: 'routing_error'
  });

  return {
    agentType: 'default',
    config: getAgentConfig('default'),
    reasoning: 'Fallback to default agent due to routing error'
  };
}
```

## Tool Selection Based on Agent Type

The system uses a centralized tool registry that conditionally includes tools based on the agent configuration:

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

## Chat Engine Configuration 

The chat engine is configured with agent-specific settings using a detailed configuration object:

```typescript
// Create the chat engine with the detected agent configuration
const engineConfig: ChatEngineConfig = {
  tools, // Tools object built conditionally
  requiresAuth: !bypassAuth, // Allow bypassing auth for testing
  corsEnabled: false,
  model: agentConfig.model || 'gpt-4o',
  temperature: agentConfig.temperature || 0.7,
  maxTokens: 16000,
  operationName: `chat_${agentType}`,
  cacheEnabled: true,
  messageHistoryLimit: 50,
  // Enable DeepSearch at the engine level if supported by the agent
  useDeepSearch: shouldUseDeepSearch,
  // Use enhanced system prompt following AI SDK standards
  systemPrompt: prompts.buildSystemPrompt(agentType, shouldUseDeepSearch),
  // Configure message persistence
  messagePersistenceDisabled: disableMessagePersistence,
  // Pass prompts system
  prompts,
  // Set agent type
  agentType,
  // Pass additional configuration for tools following AI SDK patterns
  body: {
    deepSearchEnabled: shouldUseDeepSearch, // Pass for safety check in execute function
    sessionId,
    userId: persistenceUserId, // Pass the authenticated user ID for message persistence
    agentType,
    // AI SDK standard configuration for multi-step agents
    maxSteps: 5, // Allow up to 5 steps for complex reasoning chains
    toolChoice: shouldUseDeepSearch ? 'auto' : 'none' // Set toolChoice based on DeepSearch availability
  }
};
```

## Benefits of This Approach

1. **Follows Vercel AI SDK Best Practices**: Directly implements the routing pattern from the documentation
2. **Specialized Responses**: Each agent has optimized parameters for its domain
3. **Reasoning Transparency**: Includes detailed reasoning for agent selection decisions
4. **Clean Implementation**: Simple, direct mapping from classification to configuration
5. **Maintainable Architecture**: Clear separation of routing logic from chat engine functionality
6. **Tool Selection Flexibility**: Different agent types can use different tool sets
7. **Manual Override Support**: Allows users to manually select an agent when needed
8. **Contextual Deep Search**: Deep Search is only enabled when both the agent supports it and the user toggles it
9. **Performance Optimization**: GPT-4o-mini for routing decisions provides a good balance of speed and accuracy
10. **Comprehensive Logging**: Detailed logging throughout the routing process for monitoring and debugging
11. **Graceful Fallbacks**: Automatic fallback to default agent if routing fails
12. **Enhanced Tool Integration**: Structured attribution for tool usage in responses
13. **Multi-Step Reasoning**: Support for complex multi-step agent workflows

## References

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Vercel AI SDK Routing Guide](https://sdk.vercel.ai/docs/concepts/agents#routing) 
- [Vercel AI SDK generateObject](https://sdk.vercel.ai/docs/reference/generate-object)
- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)
- [Zod Schema Validation](https://zod.dev/) 

## Implementation Details and Advanced Configuration

### Types and Interfaces

The agent routing system relies on several key TypeScript interfaces:

```typescript
// Agent type definition - represents the available specialized agents
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';

// Agent configuration interface
export interface AgentConfig {
  systemPrompt: string;
  temperature?: number;
  model?: string;
  toolOptions: {
    useKnowledgeBase?: boolean;
    useWebScraper?: boolean;
    useDeepSearch?: boolean;
    useRagTool?: boolean;
  };
}

// Agent routing result schema using Zod
export const agentRoutingSchema = z.object({
  reasoning: z.string().describe('Reasoning for why this agent type is most appropriate'),
  agentType: z.enum(['default', 'copywriting', 'google-ads', 'facebook-ads', 'quiz'])
    .describe('The type of agent that should handle this query')
});
```

### Deep Search Integration

Deep Search is a powerful capability that allows agents to access real-time web information, but it requires careful integration:

```typescript
// DeepSearch implementation with enhanced attribution
export const deepSearchTool = tool({
  description: "Search the web for up-to-date information about any topic. Use this when you need information that might not be in your training data or when you need to verify current facts.",
  parameters: z.object({
    search_term: z.string().describe("The specific search term to look up on the web. Be as specific as possible.")
  }),
  execute: async ({ search_term }, { toolCallId, body }) => {
    const operationId = `deep-search-${Date.now().toString(36)}`;
    const startTime = Date.now();

    try {
      // Double security check: Verify deep search is explicitly enabled
      const deepSearchEnabled = body?.deepSearchEnabled === true;
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
      
      // Add structured attribution section to beginning of response
      const formattedResponse = `
## DeepSearch Results
Search term: "${search_term}"

${result.content}

### Sources
${result.sources.map(source => `- ${source.title}: ${source.url}`).join('\n')}
`;
      
      // Log successful search
      edgeLogger.info("Deep Search completed successfully", {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'deep_search_completed',
        toolCallId,
        searchTerm: search_term,
        responseLength: formattedResponse.length,
        durationMs: Date.now() - startTime,
        sourceCount: result.sources.length
      });
      
      return formattedResponse;
    } catch (error) {
      // Enhanced error logging and user-friendly response
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      edgeLogger.error("Deep Search failed", {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'deep_search_error',
        toolCallId,
        searchTerm: search_term,
        error: errorMessage,
        durationMs: Date.now() - startTime
      });
      
      return `I encountered an error while searching for information: ${errorMessage}. Please try again with a more specific search term.`;
    }
  }
});
```

### StreamChat Implementation with Agent Configuration

The chat engine uses the Vercel AI SDK's streamChat function to create a streaming response with the correct agent configuration:

```typescript
// Create a streaming chat response with the detected agent
const chatEngine = createChatEngine(engineConfig);
return chatEngine.handleRequest(req);
```

Inside the ChatEngine class, the AI SDK is utilized with context handling:

```typescript
// Inside the ChatEngine class
protected async generateChatResponse(context: ChatEngineContext): Promise<StreamingTextResponse> {
  const { messages, userId, sessionId } = context;
  const { tools, model, temperature, systemPrompt, maxTokens, body } = this.config;
  
  // Create a response using the Vercel AI SDK with proper configuration
  return streamText({
    model: openai(model as any),
    system: systemPrompt,
    messages: messages as any,
    temperature,
    maxTokens,
    tools: Object.values(tools || {}),
    toolChoice: body?.toolChoice || "auto",
    body: {
      ...body,
      sessionId,
      userId
    }
  });
}
```

### Message Persistence and Session Management

The chat engine implements message persistence to maintain conversation context across sessions:

```typescript
// Message persistence in the chat engine
if (!this.config.messagePersistenceDisabled && context.userId && context.sessionId) {
  try {
    await this.persistenceService.saveMessage({
      sessionId: context.sessionId,
      userId: context.userId,
      message: lastMessage,
      agentType: this.config.agentType || 'default'
    });
    
    edgeLogger.info('Message saved to database', {
      operation: this.config.operationName,
      sessionId: context.sessionId,
      messageRole: lastMessage.role
    });
  } catch (error) {
    edgeLogger.error('Failed to save message', {
      operation: this.config.operationName,
      sessionId: context.sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

### Performance Optimization

The agent routing system includes several optimizations:

1. **Efficient Model Selection**: Using gpt-4o-mini for routing decisions reduces latency and cost
2. **Caching Mechanism**: Conversation contexts are cached to improve response time
3. **Conditional Tool Loading**: Tools are only loaded if the agent configuration enables them
4. **Response Streaming**: All responses use streaming to improve perceived performance

## Maintenance and Monitoring

### Key Metrics to Monitor

The agent routing system logs detailed metrics to help with monitoring and optimization:

1. **Agent Selection Counts**: How often each agent is selected
2. **Routing Confidence**: Confidence scores for agent selection decisions
3. **Tool Usage**: Frequency and outcome of tool usage by agent type
4. **Error Rates**: Frequency of routing errors, fallbacks, and API failures
5. **Latency**: Time taken for agent selection and overall response generation

Example logging implementation:

```typescript
// Inside the agent routing system
edgeLogger.info('Agent routing metrics', {
  category: LOG_CATEGORIES.METRICS,
  operation: 'agent_metrics',
  period: 'daily', // or hourly, weekly
  agentSelections: {
    default: defaultCount,
    copywriting: copywritingCount,
    'google-ads': googleAdsCount,
    'facebook-ads': facebookAdsCount,
    quiz: quizCount
  },
  averageConfidence: avgConfidence,
  toolUsage: {
    knowledgeBase: kbUsageCount,
    webScraper: webScraperUsageCount,
    deepSearch: deepSearchUsageCount
  },
  errorRates: {
    routingErrors: routingErrorCount,
    fallbacks: fallbackCount,
    apiFailures: apiFailureCount
  },
  latency: {
    routingMs: avgRoutingMs,
    responseMs: avgResponseMs
  }
});
```

### Extending the System

To add a new agent type to the system:

1. **Update Agent Type Definition**: Add the new agent type to the `AgentType` type
2. **Create Agent Prompt**: Define a specific system prompt for the new agent
3. **Add Configuration**: Configure the new agent's parameters in `getAgentConfig`
4. **Update Routing Schema**: Add the new agent type to the Zod enum
5. **Update Routing Prompt**: Add the new agent to the routing prompt description

```typescript
// Example of adding a 'video-marketing' agent type
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz' | 'video-marketing';

// Add to system prompts
export const AGENT_PROMPTS: Record<AgentType, string> = {
  // Existing agents...
  'video-marketing': VIDEO_MARKETING_SYSTEM_PROMPT
};

// Add to the configuration map
const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
  // Existing configurations...
  'video-marketing': {
    temperature: 0.6,
    model: 'gpt-4o',
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: true,
      useRagTool: true
    }
  }
};

// Update the routing schema
export const agentRoutingSchema = z.object({
  reasoning: z.string().describe('Reasoning for why this agent type is most appropriate'),
  agentType: z.enum(['default', 'copywriting', 'google-ads', 'facebook-ads', 'quiz', 'video-marketing'])
    .describe('The type of agent that should handle this query')
});
```

### Testing Agent Routing

The system includes comprehensive testing utilities to validate routing decisions:

```typescript
// Test utility for agent routing
export async function testAgentRouting(message: string): Promise<{
  agentType: AgentType;
  reasoning: string;
  confidence: number;
}> {
  try {
    const result = await detectAgentType(message);
    return {
      agentType: result.agentType,
      reasoning: result.reasoning || '',
      confidence: 1.0 // Could be calculated based on reasoning
    };
  } catch (error) {
    console.error('Agent routing test failed:', error);
    return {
      agentType: 'default',
      reasoning: 'Routing test failed: ' + (error instanceof Error ? error.message : String(error)),
      confidence: 0
    };
  }
}
```

## Advanced Feature: Multi-Step Agent Workflows

The system supports complex multi-step agent workflows using Vercel AI SDK patterns:

```typescript
// Configure multi-step workflows in the chat engine
const engineConfig: ChatEngineConfig = {
  // Basic configuration...
  
  // Multi-step agent configuration
  body: {
    // Other body parameters...
    
    // AI SDK standard configuration for multi-step agents
    maxSteps: 5, // Allow up to 5 steps for complex reasoning chains
    toolChoice: shouldUseDeepSearch ? 'auto' : 'none', // Set toolChoice based on DeepSearch availability
    
    // Structured strategy for complex tasks
    strategy: 'TOOLS_THEN_RESPOND', // or 'RESPOND_THEN_TOOLS' or 'TOOLS_ONLY'
    
    // Configure intermediate steps logging
    logIntermediateSteps: true,
    
    // Define exit criteria
    exitCriteria: {
      timeoutMs: 15000, // 15-second timeout
      maxTokens: 8000   // Token budget
    }
  }
};
```

## Best Practices

1. **Use Explicit Agent Selection**: Allow users to explicitly select agents when appropriate
2. **Monitor Routing Accuracy**: Regularly review routing decisions and adjust prompts as needed
3. **Test with Diverse Queries**: Ensure routing works well across different domains and query types
4. **Balance Tool Selection**: Different agents should have access to appropriate tools
5. **Optimize System Prompts**: Each agent's system prompt should be specialized and focused
6. **Maintain Clear Attribution**: Always clearly attribute information from tools
7. **Implement Robust Logging**: Log all important events for monitoring and debugging
8. **Use Fallbacks Appropriately**: Default agent should be used as a fallback, not as a primary route
9. **Configure Temperature Appropriately**: Use lower temperatures for fact-based agents, higher for creative ones
10. **Regularize Agent Maintenance**: Update agent configurations and prompts on a scheduled basis

## Conclusion

This agent routing implementation delivers a sophisticated, specialized agent system following the best practices outlined by Vercel's AI SDK. The architecture enables clear separation of concerns, appropriate tool selection, and robust error handling, while maintaining transparency through detailed logging and reasoning explanations.

The implementation is designed to be maintainable and extensible, allowing for new agent types and tools to be added as the application evolves, while keeping the core routing logic stable and predictable. 