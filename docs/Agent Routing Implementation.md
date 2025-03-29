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

This follows the example in the Vercel AI SDK documentation where they use `generateObject` to classify customer queries.

## Agent-Specific Configuration

Each agent type is mapped directly to its configuration, following Vercel's pattern:

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
  // Other agent configurations...
};

return {
  systemPrompt,
  ...configurations[agentType]
};
```

This direct mapping is similar to Vercel's example where they map classification results to specific model configurations.

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
  useRagTool: agentConfig.toolOptions.useRagTool
});

// Create a configured chat engine for the detected agent
const engine = createChatEngine({
  tools,
  systemPrompt: prompts.buildSystemPrompt(agentType, shouldUseDeepSearch),
  temperature: agentConfig.temperature,
  operationName: `chat_${agentType}`,
  // Other configuration options
});

// Let the engine handle the request
return engine.handleRequest(req);
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

## Benefits of This Approach

1. **Follows Vercel AI SDK Best Practices**: Directly implements the routing pattern from their documentation
2. **Specialized Responses**: Each agent has optimized parameters for its domain
3. **Clean Implementation**: Simple, direct mapping from classification to configuration
4. **Maintainable Architecture**: Clear separation of routing logic from chat engine functionality
5. **Tool Selection Flexibility**: Different agent types can use different tool sets
6. **Contextual Deep Search**: Deep Search is only enabled when both the agent supports it and the user toggles it
7. **Performance Optimization**: GPT-4o-mini for routing decisions provides a good balance of speed and accuracy

## Future Enhancements

1. **User Preference Memory**: Remember user's preferred agent type for future sessions
2. **Hybrid Routing**: Combine AI-based routing with keyword-based scoring for optimal performance
3. **Continuous Learning**: Periodically update routing model based on user feedback
4. **Additional Agent Types**: Expand with more specialized agents for different photography niches
5. **Tool Usage Analytics**: Track which tools each agent uses to optimize configurations

## References

- [Vercel AI SDK Routing Documentation](https://sdk.vercel.ai/docs/foundations/agents#routing) 
- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)
- [Zod Schema Validation](https://zod.dev/) 