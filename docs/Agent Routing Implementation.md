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
  prompt: `Analyze this user message and determine which specialized agent should handle it...`,
  temperature: 0.1
});
```

The schema defines the expected response format using Zod:

```typescript
export const agentRoutingSchema = z.object({
  reasoning: z.string(),
  agentType: z.enum(['default', 'copywriting', 'google-ads', 'facebook-ads', 'quiz'])
});
```

This follows the example in the Vercel AI SDK documentation where they use `generateObject` to classify customer queries.

## Agent-Specific Configuration

Each agent type is mapped directly to its configuration, following Vercel's pattern:

```typescript
const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
  'copywriting': {
    temperature: 0.7,
    toolOptions: {
      // configuration details
    }
  },
  // Other agent configurations...
};

return {
  systemPrompt,
  ...configurations[agentType]
};
```

This direct mapping is similar to Vercel's example where they map classification results to specific model configurations:

```typescript
const { text: response } = await generateText({
  model:
    classification.complexity === 'simple'
      ? openai('gpt-4o-mini')
      : openai('o3-mini'),
  system: {
    general: 'You are an expert customer service agent...',
    refund: 'You are a customer service agent specializing in refund requests...',
    technical: 'You are a technical support specialist...'
  }[classification.type],
  prompt: query,
});
```

## Integration with Chat Engine

The agent routing system integrates with our chat engine architecture:

```typescript
// Create a configured chat engine for the detected agent
const engine = createChatEngine({
  tools,
  systemPrompt: config.systemPrompt,
  temperature: config.temperature,
  operationName: `agent_chat_${agentType}`,
  // Other configuration options
});

// Let the engine handle the request
return engine.handleRequest(req);
```

## API Route Handler

The `app/api/agent-chat/route.ts` endpoint demonstrates the routing pattern:

1. Extracts the user message from the request
2. Detects the appropriate agent type using the `generateObject` pattern
3. Creates a configured chat engine based on the detected agent
4. Processes the request

## Benefits of This Approach

1. **Follows Vercel AI SDK Best Practices**: Directly implements the routing pattern from their documentation
2. **Specialized Responses**: Each agent has optimized parameters for its domain
3. **Clean Implementation**: Simple, direct mapping from classification to configuration
4. **Maintainable Architecture**: Clear separation of routing logic from chat engine functionality

## Next Steps

1. **Frontend Integration**: Update the UI to work with the agent-based routing system
2. **Performance Monitoring**: Track the effectiveness of the agent selection
3. **Expanded Agent Types**: Add new specialized agents as needed

## References

- [Vercel AI SDK Routing Documentation](https://sdk.vercel.ai/docs/foundations/agents#routing) 