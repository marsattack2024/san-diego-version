# Marlan - The Photo Profit Bot

An AI-powered chat application designed specifically for marketing assistance to portrait photographers. Marlan leverages GPT-4o models via the Vercel AI SDK, enhanced with retrieval-augmented generation (RAG), web scraping capabilities, and deep web search functionality through the Perplexity API.

## System Architecture Overview

Marlan is built as a modern Next.js 15 application with a focus on serverless architecture, vector-based knowledge retrieval, and specialized AI agents. The system is designed to provide photographers with targeted marketing advice by combining multiple knowledge sources:

1. **Vector Database (RAG)**: Pre-indexed photography marketing knowledge, stored in Supabase with pgvector
2. **Web Scraping**: Dynamic content extraction from URLs shared during conversations
3. **Deep Search**: Advanced web research capabilities via Perplexity API integration
4. **Specialized Agents**: Domain-specific AI agents with tailored prompts and tools

### Core Architecture Components

```
├── app/                    # Next.js app router pages
│   ├── api/                # API routes (serverless functions)
│   │   ├── auth/           # Authentication endpoints
│   │   ├── chat/           # Chat API endpoints
│   │   ├── widget-chat/    # Widget-specific chat endpoint
│   │   ├── perplexity/     # DeepSearch API endpoint
│   │   ├── profile/        # User profile endpoints
│   │   ├── events/         # Server-sent events endpoint
│   ├── chat/               # Chat interface pages
│   ├── admin/              # Admin dashboard pages
│   └── widget.js/          # Widget JavaScript loader
├── components/             # React components
│   ├── chat-widget/        # Embeddable widget components
│   ├── admin/widget/       # Widget configuration UI
├── lib/                    # Core business logic
│   ├── chat-engine/        # Unified chat processing system
│   │   ├── core.ts         # Chat engine core implementation
│   │   ├── message-persistence.ts # Message storage and retrieval
│   │   ├── agent-router.ts # Agent routing logic
│   │   ├── prompts/        # System prompts for agents
│   ├── tools/              # AI SDK tool implementations
│   │   ├── knowledge-base.tool.ts # Knowledge base tool
│   │   ├── web-scraper.tool.ts    # Web scraper tool
│   │   ├── deep-search.tool.ts    # Deep search tool
│   │   └── registry.tool.ts       # Tool registry
│   ├── cache/              # Redis caching implementation
│   ├── services/           # Service layer (Puppeteer, Perplexity)
│   ├── logger/             # Structured logging system
│   └── utils/              # Shared utilities
├── public/                 # Static assets
│   └── widget/             # Compiled widget scripts
```

## Chat Engine Architecture

The Chat Engine is the unified system that powers all chat interactions across the application. It provides a consistent interface for processing chat requests, executing tools, and generating responses while integrating with the Zustand store for state management.

### Chat Engine Core

The Chat Engine Core (`lib/chat-engine/core.ts`) provides a unified interface for all chat interactions:

```typescript
export class ChatEngine {
  constructor(config: ChatEngineConfig) {
    // Initialize with configuration
  }

  // Main entry point for handling chat requests
  public async handleRequest(req: Request): Promise<Response> {
    // Authentication, parsing, and request processing
  }

  // Core processing logic
  private async processRequest(context: ChatEngineContext): Promise<Response> {
    // Message processing, tool execution, and streaming
    
    // Title generation and store updates
    const result = await streamText({
      // Configuration options
      messages: allMessages,
      model: openai(this.config.model || 'gpt-4o'),
      temperature: this.config.temperature || 0.7,
      maxTokens: this.config.maxTokens,
      // Callbacks that update the Zustand store
      onFinish: (completion, response) => {
        // Update title in Zustand store for real-time UI updates
        if (!this.config.messagePersistenceDisabled && firstMessageInConversation) {
          const { updateConversationTitle } = useChatStore.getState();
          updateConversationTitle(sessionId, generatedTitle);
        }
      }
    });
    
    // Ensure stream processing completes even if client disconnects
    result.consumeStream();
  }
}
```

Key features of the Chat Engine:
- Unified authentication and authorization
- Standardized request/response handling
- Integrated message persistence
- Zustand store integration for state synchronization
- Consistent tool execution via Vercel AI SDK
- Centralized prompt management
- Comprehensive error handling and logging
- Support for all chat interfaces (main app, widget)
- Client disconnect resilience with consumeStream()

### Message Persistence

The Message Persistence service (`lib/chat-engine/message-persistence.ts`) provides a consistent interface for storing and retrieving chat messages:

```typescript
export class MessagePersistenceService {
  constructor(config: MessagePersistenceConfig) {
    // Initialize with configuration
  }

  // Store a message and update Zustand store
  async saveMessage(message: Message, context: MessageContext): Promise<MessageSaveResult> {
    // Save to database
    const result = await this.saveToDatabase(message, context);
    
    // Update Zustand store for real-time UI updates
    const { addMessage } = useChatStore.getState();
    addMessage(context.sessionId, {
      id: message.id,
      role: message.role,
      content: message.content
    });
    
    return result;
  }

  // Retrieve message history
  async getRecentHistory(
    sessionId: string,
    userId: string,
    currentMessages: Message[],
    limit?: number
  ): Promise<Message[]>
}
```

### Agent Router

The Agent Router (`lib/chat-engine/agent-router.ts`) uses AI to route messages to the appropriate specialized agent:

```typescript
export async function detectAgentType(
  message: string,
  currentAgentType: AgentType = 'default'
): Promise<{
  agentType: AgentType;
  config: AgentConfig;
  reasoning?: string;
}> {
  // AI-based agent detection logic using generateObject
}
```

## Tool System

The application uses a modernized tool system based on the Vercel AI SDK's tool calling interface. Tools are defined as standalone modules and registered through a central registry.

### Tool Registry

The Tool Registry (`lib/tools/registry.tool.ts`) provides a centralized registration and configuration system:

```typescript
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
  // Select and configure tools based on options
}
```

### Knowledge Base Tool

The Knowledge Base Tool (`lib/tools/knowledge-base.tool.ts`) provides access to the RAG system:

```typescript
export const knowledgeBaseTool = tool({
  description: "Search the knowledge base for information...",
  parameters: knowledgeBaseSchema,
  execute: async ({ query }, { toolCallId }) => {
    // Implementation using vector search
  }
});
```

### Web Scraper Tool

The Web Scraper Tool (`lib/tools/web-scraper.tool.ts`) extracts content from URLs in user messages:

```typescript
export const webScraperTool = tool({
  description: "Scrapes content from web pages...",
  parameters: webScraperSchema,
  execute: async ({ urls }, { toolCallId }) => {
    // Implementation using puppeteer service
  }
});
```

### DeepSearch Tool

The DeepSearch Tool (`lib/tools/deep-search.tool.ts`) provides real-time web search capabilities:

```typescript
export const deepSearchTool = tool({
  description: "Search the web for up-to-date information...",
  parameters: deepSearchSchema,
  execute: async ({ search_term }, { toolCallId }) => {
    // Implementation using perplexity service
  }
});
```

## Agent System

The agent system routes user messages to specialized agents optimized for different tasks using AI-based classification.

### Agent Types

1. **Default Agent**: General marketing assistant
2. **Copywriting Agent**: Specialized for website copy, landing pages, email copy
3. **Google Ads Agent**: Optimized for search campaign creation and optimization
4. **Facebook Ads Agent**: Focused on social media advertising strategies
5. **Quiz Agent**: Designed for interactive content creation

### Agent Configuration

Each agent is configured with specialized tools and settings:

```typescript
function getAgentConfig(agentType: AgentType): AgentConfig {
  // Get system prompt using the prompts module
  const systemPrompt = buildSystemPrompt(agentType);

  // Agent-specific configurations
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
    // Other agent configurations...
  };

  return {
    systemPrompt,
    ...configurations[agentType]
  };
}
```

## Caching System

The caching system uses Redis (via Upstash) for caching various types of data with proper TTL management and fallbacks.

### Cache Service

The Cache Service (`lib/cache/cache-service.ts`) provides a unified interface for all caching operations:

```typescript
export class CacheService {
  // Basic operations
  async get<T>(key: string): Promise<T | null>
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>
  async delete(key: string): Promise<void>
  async exists(key: string): Promise<boolean>
  
  // Domain-specific operations
  async getRagResults<T>(query: string, options?: any): Promise<T | null>
  async setRagResults<T>(query: string, results: T, options?: any): Promise<void>
  async getScrapedContent(url: string): Promise<string | null>
  async setScrapedContent(url: string, content: string): Promise<void>
  async getDeepSearchResults<T>(query: string): Promise<T | null>
  async setDeepSearchResults<T>(query: string, results: T): Promise<void>
}
```

## Logging System

A comprehensive logging system is implemented with structured logging for both server and edge environments:

### Edge Logger

The Edge Logger (`lib/logger/edge-logger.ts`) is optimized for edge runtime environments:

```typescript
export const edgeLogger = {
  debug(message: string, metadata?: Record<string, any>): void
  info(message: string, metadata?: Record<string, any>): void
  warn(message: string, metadata?: Record<string, any>): void
  error(message: string, metadata?: Record<string, any>): void
}
```

### Chat Logger

The Chat Logger (`lib/logger/chat-logger.ts`) provides specialized logging for chat operations:

```typescript
export const chatLogger = {
  startRequest(operationId: string, context: Record<string, any>): void
  endRequest(operationId: string, context: Record<string, any>): void
  toolCall(operationId: string, toolName: string, context: Record<string, any>): void
  // Additional methods...
}
```

## API Routes

### Chat API Route

The Chat API Route (`app/api/chat/route.ts`) provides the HTTP interface for the Chat Engine:

```typescript
export async function POST(req: Request) {
  // Extract request body, validate, and process
  const { agentType, config: agentConfig } = await detectAgentType(
    lastUserMessage.content as string,
    requestedAgentId
  );
  
  // Create tools based on agent configuration
  const tools = createToolSet({
    useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
    useWebScraper: agentConfig.toolOptions.useWebScraper,
    useDeepSearch: agentConfig.toolOptions.useDeepSearch
  });
  
  // Create chat engine with appropriate configuration
  const chatEngine = createChatEngine({
    tools,
    systemPrompt: agentConfig.systemPrompt,
    temperature: agentConfig.temperature,
    agentType: agentType,
    operationName: 'chat_api',
    body: { deepSearchEnabled }
  });
  
  // Process the request
  const response = await chatEngine.handleRequest(req);
  return response;
}
```

## Key User Flows

### Chat Interaction Flow

1. User submits a message via the chat interface
2. Message is sent to the Chat API with the conversation ID and agent preference
3. The Agent Router classifies the message and selects the appropriate specialized agent
4. Agent selects appropriate tools based on configuration
5. Tools are executed as needed to retrieve relevant information
6. AI generates a streaming response with reference to tools used
7. Conversation is persisted to the database for future context

### Tool Execution Flow

1. The Chat Engine receives a user query
2. The AI model determines which tools to use based on the query
3. Tools are executed with appropriate parameters
4. Tool results are collected and added to the prompt context
5. The AI model generates a response incorporating tool results
6. The response is streamed back to the user with tool usage indicators

## Performance Optimization Techniques

1. **Redis Caching**: Comprehensive caching for RAG queries, web scraping, and DeepSearch
2. **Streaming Responses**: Immediate response start with progressive rendering
3. **Conditional Tool Execution**: Tools only run when needed to reduce latency
4. **In-Memory Fallbacks**: Graceful degradation when external services are unavailable
5. **Optimized Message Loading**: Only loading necessary message history from the database
6. **Client Disconnect Handling**: Processing continues even when clients disconnect
7. **Edge-compatible Implementations**: Key services optimized for Edge runtime

## Environment Variables

```
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_APP_URL=https://your-app-url.vercel.app

# Redis Caching
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Optional
PERPLEXITY_API_KEY=your_perplexity_api_key
SCRAPER_ENDPOINT=your_puppeteer_endpoint
LOG_LEVEL=info
WIDGET_ALLOWED_ORIGINS=https://example.com,*
NEXT_PUBLIC_MAX_TOKENS=600
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account with vector extension enabled
- OpenAI API key
- Perplexity API key (optional, for deep search)
- Upstash Redis account (for production caching)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/marlan.git
   cd marlan
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

4. Set up Supabase:
   - Create a new Supabase project
   - Enable the pgvector extension: `CREATE EXTENSION vector;`
   - Run the SQL from `supabase/migrations` in the Supabase SQL editor
   - Add your Supabase URL and anon key to `.env.local`

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deployment

1. Push your code to GitHub
2. Create a project on Vercel
3. Configure environment variables in Vercel
4. Deploy the application

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 