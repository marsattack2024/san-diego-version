# Multi-Agent System

A flexible and extensible multi-agent system that provides specialized AI agents for different domains.

## Architecture Overview

This system follows the Orchestrator-Worker pattern, with the `AgentRouter` acting as the orchestrator that directs queries to specialized agents. The architecture is designed to be modular, allowing for easy addition of new agents and tools.

### Agents

The system includes the following agents:

- **Default Agent**: General-purpose assistant capable of handling a variety of tasks
- **Google Ads Agent**: Specialist in Google Ads campaign creation and optimization
- **Facebook Ads Agent**: Expert in Facebook and Instagram advertising strategies
- **Copywriting Agent**: Specialist in creating compelling marketing copy
- **Quiz Agent**: Expert in creating and managing interactive quizzes

## Implementation Phases

The implementation is divided into phases:

### Phase 1: Core Architecture ✅

- [x] Define base agent interfaces and types
- [x] Create agent router for directing queries
- [x] Implement base agent class
- [x] Set up logging infrastructure
- [x] Create agent context management

### Phase 2: Specialized Agents ✅

- [x] Implement Default Agent
- [x] Implement Google Ads Agent
- [x] Implement Facebook Ads Agent
- [x] Implement Copywriting Agent
- [x] Implement Quiz Agent
- [x] Create system prompts for each agent

### Phase 3: UI Components ✅

- [x] Create agent selector component
- [x] Implement chat interface
- [x] Add agent switching functionality
- [x] Develop message display components

### Phase 4: Tools and Capabilities ⏳

- [ ] Implement specialized tools for each agent
- [ ] Add web search capabilities
- [ ] Create analytics tools
- [ ] Develop content generation tools

## Current Status

- **Phase 1**: Complete
- **Phase 2**: Complete
- **Phase 3**: Complete
- **Phase 4**: Not started

## Implementation Details

### Core Architecture

The system is built on a solid foundation with:
- Type-safe interfaces for agents, messages, and tools
- A flexible router for directing queries to specialized agents
- Comprehensive logging for debugging and monitoring
- Context management for maintaining conversation state

### Specialized Agents

Each agent is implemented with:
- Unique capabilities and expertise
- Custom system prompts for specialized knowledge
- Agent-specific formatting for optimal responses
- Structured logging for monitoring agent activities

### UI Components

The chat interface includes:
- **ChatInterface**: Main component orchestrating the chat experience
- **AgentSelector**: Dropdown for switching between specialized agents
- **ChatInput**: Text input with support for Enter key submission
- **ChatMessages**: Message display with user/assistant styling and loading indicators

## API Integration

The system includes a Next.js API route at `/api/chat` that:
- Processes incoming chat messages
- Routes queries to the appropriate agent
- Returns formatted responses
- Handles errors gracefully

## Usage Example

```typescript
import { AgentRouter, DefaultAgent, GoogleAdsAgent } from '@/agents';
import { createAgentContext } from '@/agents/core/agent-context';

// Create an agent router
const agentRouter = new AgentRouter();

// Register agents
agentRouter.registerAgents([
  new DefaultAgent(),
  new GoogleAdsAgent()
]);

// Create a conversation context
const context = createAgentContext();

// Process a message with the default agent
const response = await agentRouter.routeMessage(
  "What are some effective marketing strategies?",
  context
);

// Process a message with a specific agent
const adsResponse = await agentRouter.routeMessage(
  "How can I improve my Google Ads quality score?",
  context,
  'google-ads'
);
```

## Logging System

The AI Chat Interface includes a comprehensive logging system that follows best practices for Next.js TypeScript applications. Key features include:

- **Structured JSON Logging**: All logs are formatted as JSON for easy parsing and analysis
- **Context-Aware Loggers**: Loggers maintain context across the request lifecycle
- **Performance Metrics**: Automatic tracking of response times and operation durations
- **Error Tracking**: Detailed error information with stack traces
- **Environment-Aware Configuration**: Different log levels for development and production
- **Remote Logging**: Support for sending client-side logs to the server
- **Batch Processing**: Client logs are batched to reduce network requests
- **Sampling**: High-volume logs are sampled in production to reduce overhead
- **Business Event Logging**: Dedicated API for logging business-relevant events

For more details, see [LOGGING-IMPLEMENTATION.md](./LOGGING-IMPLEMENTATION.md).

### Server-Side Logging

Server-side logging is implemented using Pino, configured in `src/utils/server-logger.ts`. All API routes and middleware use structured logging for requests, responses, and errors.

### Client-Side Logging

Client-side logging is implemented using loglevel, configured in `src/utils/client-logger.ts`. Components use structured logging for user interactions and lifecycle events.

### Business Event Logging

Business events are logged using a dedicated API in `src/utils/client-logger.ts`:

```typescript
// Example of business event logging
businessEvents.chatStarted(userId, agentType);
businessEvents.messageSent(userId, messageLength, agentType);
businessEvents.deepSearchPerformed(userId, query, resultCount);
businessEvents.chatDeleted(userId, messageCount);
```

### Testing Logging

To test the logging implementation, run:

```bash
node scripts/test-logging.cjs
```

## Next Steps

1. Implement specialized tools for each agent
2. Add web search capabilities for enhanced responses
3. Create analytics tools for performance tracking
4. Develop content generation tools for specialized agents
5. Fix remaining linter errors in the API route 