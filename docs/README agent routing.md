# Agent Routing Implementation with Vercel AI SDK

This document outlines the implementation of our agent routing system, which follows the exact pattern described in the Vercel AI SDK documentation.

## Overview

Our application supports multiple specialized agents, each with particular expertise in different domains. The agent routing system automatically selects the most appropriate agent based on message content analysis, following the routing pattern recommended by the Vercel AI SDK.

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

## Agent-Specific Configuration

Each agent type has a dedicated configuration that includes:

```typescript
// Get system prompt using the prompts module
const systemPrompt = buildSystemPrompt(agentType);

// Map agent types directly to configurations 
const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
  'copywriting': {
    temperature: 0.7, // More creative for copywriting
    model: 'gpt-4o',
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: true, 
    }
  },
  'google-ads': {
    temperature: 0.4, // More focused for ads
    model: 'gpt-4o',
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: true,
    }
  },
  // Other agent configurations follow the same pattern
};

return {
  systemPrompt,
  ...configurations[agentType]
};
```

## Integration with Chat Engine

The agent routing system integrates with our chat engine architecture:

```typescript
// Detect the appropriate agent type based on message content
const { agentType, config: agentConfig } = await detectAgentType(
  lastUserMessage.content as string,
  requestedAgentId as any
);

// Determine if this agent type can use Deep Search
const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;

// Only enable Deep Search if both the user has toggled it AND the agent supports it
const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

// Create tools object with conditional inclusion of Deep Search
const tools = createToolSet({
  useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
  useWebScraper: agentConfig.toolOptions.useWebScraper,
  useDeepSearch: shouldUseDeepSearch, // Only include if explicitly enabled
});

// Create a configured chat engine for the detected agent
const engineConfig: ChatEngineConfig = {
  tools,
  model: agentConfig.model || 'gpt-4o',
  temperature: agentConfig.temperature || 0.7,
  maxTokens: 16000,
  operationName: `chat_${agentType}`,
  cacheEnabled: true,
  messageHistoryLimit: 50,
  // Enable DeepSearch at the engine level if supported by the agent
  useDeepSearch: shouldUseDeepSearch,
  // Use enhanced system prompt with tool-specific instructions
  systemPrompt: prompts.buildSystemPrompt(agentType, shouldUseDeepSearch),
  // Additional configuration
  body: {
    deepSearchEnabled: shouldUseDeepSearch,
    sessionId,
    userId: persistenceUserId,
    agentType,
    // AI SDK standard configuration for multi-step agents
    maxSteps: 5,
    toolChoice: shouldUseDeepSearch ? 'auto' : 'none'
  }
};

// Create and use the chat engine
const engine = new ChatEngine(engineConfig);
return engine.handleRequest(req);
```

## Logging and Monitoring

The system includes comprehensive logging to track agent selection and usage:

```typescript
// Log the AI routing decision
edgeLogger.info('Agent routing decision', {
  category: LOG_CATEGORIES.CHAT,
  operation: 'agent_routing_decision',
  selectedAgent,
  reasoning: routingResult.object.reasoning.substring(0, 100) + '...'
});

// Log user ID and configuration for debugging
edgeLogger.info('Chat engine configuration', {
  operation: 'chat_engine_config',
  sessionId,
  userId: persistenceUserId,
  agentType,
  deepSearchEnabled: shouldUseDeepSearch
});
```

## Error Handling and Fallback

The system includes robust error handling and fallback mechanisms:

```typescript
try {
  // Use AI to classify the message
  const routingResult = await generateObject({
    // Configuration and prompt
  });
  
  return {
    agentType: routingResult.object.agentType as AgentType,
    config: getAgentConfig(routingResult.object.agentType as AgentType)
  };
} catch (error) {
  // If AI routing fails, fall back to default agent
  edgeLogger.error('AI agent routing failed, falling back to default agent', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'agent_routing_fallback',
    error: error instanceof Error ? error.message : String(error),
  });

  return {
    agentType: 'default',
    config: getAgentConfig('default')
  };
}
```

## Prompt System Integration

Agent routing integrates with our prompt system to provide specialized prompts for each agent:

```typescript
// Prompt system
export const AGENT_PROMPTS: Record<AgentType, string> = {
  'default': '',  // No additional prompt for default agent
  'copywriting': COPYWRITING_SYSTEM_PROMPT,
  'google-ads': GOOGLE_ADS_SYSTEM_PROMPT,
  'facebook-ads': FACEBOOK_ADS_SYSTEM_PROMPT,
  'quiz': QUIZ_SYSTEM_PROMPT
};

// Get system prompt with tool instructions
export function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string {
  // Get the base system prompt for the agent type
  const basePrompt = buildSystemPrompt(agentType);

  // Add tool descriptions and instructions
  const withToolDescription = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following resources:\n` +
    `- Knowledge Base: Retrieve information from our internal knowledge base\n` +
    `- Web Scraper: Extract content from specific URLs provided by the user\n` +
    `- Deep Search: Conduct in-depth research on complex topics using Perplexity AI\n\n` +
    `Use these resources when appropriate to provide accurate responses.`;

  // Add DeepSearch-specific instructions based on whether it's enabled
  const deepsearchInstructions = deepSearchEnabled
    ? `### DEEP SEARCH INSTRUCTIONS:\n\n` +
      `DeepSearch is enabled for this conversation. Use it for factual questions...`
    : `NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool.`;
  
  return `${withToolDescription}\n\n${deepsearchInstructions}\n\n${attributionSection}`;
}
```

## Tool Selection Based on Agent Type

Different agent types have access to different tool sets:

```typescript
function getAgentConfig(agentType: AgentType): AgentConfig {
  // Map agent types directly to tool configurations 
  const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
    'copywriting': {
      // Configuration...
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: true,
        useDeepSearch: true,
      }
    },
    'quiz': {
      // Configuration...
      toolOptions: {
        useKnowledgeBase: true,
        useWebScraper: false, // Reduced tool set for quiz agent
        useDeepSearch: false,
      }
    },
    // Other agents...
  };

  return {
    systemPrompt: buildSystemPrompt(agentType),
    ...configurations[agentType]
  };
}
```

## Benefits of This Approach

1. **Follows Vercel AI SDK Best Practices**: Directly implements the routing pattern from the documentation
2. **Specialized Responses**: Each agent has optimized parameters for its domain
3. **Clean Implementation**: Simple, direct mapping from classification to configuration
4. **Maintainable Architecture**: Clear separation of routing logic from chat engine functionality
5. **Tool Selection Flexibility**: Different agent types can use different tool sets
6. **Contextual Deep Search**: Deep Search is only enabled when both the agent supports it and the user toggles it
7. **Performance Optimization**: GPT-4o-mini for routing decisions provides a good balance of speed and accuracy
8. **Consistent Logging**: Comprehensive logging for debugging and analytics
9. **Graceful Fallbacks**: Automatic fallback to default agent if routing fails

## References

- [Vercel AI SDK Routing Documentation](https://sdk.vercel.ai/docs/foundations/agents#routing) 
- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)
- [Zod Schema Validation](https://zod.dev/) 