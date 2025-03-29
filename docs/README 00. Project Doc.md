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
│   │   ├── widget-chat/    # Widget-specific chat endpoint
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
│   │   ├── cache-service.ts # Chat engine caching service
│   │   ├── tools/          # Tool implementations
│   │   └── prompts/        # System prompts for agents
│   ├── cache/              # Redis caching implementation
│   ├── services/           # Service layer (Puppeteer, Perplexity)
│   ├── agents/             # Agent implementations
│   ├── logger/             # Structured logging system
│   └── utils/              # Shared utilities
├── public/                 # Static assets
│   └── widget/             # Compiled widget scripts
```

## Chat Engine Architecture

The recent refactoring implemented a unified Chat Engine that powers all chat interactions across the application. This engine is designed to be modular, extensible, and consistent across different interfaces.

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
  }
}
```

Key features of the Chat Engine:
- Unified authentication and authorization
- Standardized request/response handling
- Integrated message persistence
- Consistent tool execution
- Centralized prompt management
- Comprehensive error handling and logging

### Message Persistence

The Message Persistence service (`lib/chat-engine/message-persistence.ts`) provides a consistent interface for storing and retrieving chat messages:

```typescript
export class MessagePersistenceService {
  constructor(config: MessagePersistenceConfig) {
    // Initialize with configuration
  }

  // Store a message
  async saveMessage(message: Message, context: MessageContext): Promise<void>

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

The Agent Router (`lib/chat-engine/agent-router.ts`) analyzes user messages and routes them to the appropriate specialized agent:

```typescript
export async function detectAgentType(
  message: string,
  requestedAgentId: string
): Promise<{
  agentType: string;
  config: AgentConfig;
}> {
  // Agent detection logic
}
```

## Feature Implementation Details

### 1. Agent System

The agent system uses a sophisticated routing mechanism that analyzes user queries and directs them to specialized agents based on keyword matching and context analysis.

#### Agent Types

1. **Default Agent**: General marketing assistant
2. **Copywriting Agent**: Specialized for website copy, landing pages, email copy
3. **Google Ads Agent**: Optimized for search campaign creation and optimization
4. **Facebook Ads Agent**: Focused on social media advertising strategies
5. **Quiz Agent**: Designed for interactive content creation

#### Agent Configuration

Agents are configured with specialized tools and prompts:

```typescript
export const AGENT_CONFIG = {
  default: {
    agentType: 'default',
    systemPrompt: defaultPrompt,
    temperature: 0.7,
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: true
    }
  },
  
  copywriting: {
    agentType: 'copywriting',
    systemPrompt: copywritingPrompt,
    temperature: 0.8,
    toolOptions: {
      useKnowledgeBase: true,
      useWebScraper: true,
      useDeepSearch: false
    }
  },
  
  // Additional agent configurations...
};
```

### 2. Tool System

Tools are implemented using the Vercel AI SDK's tool calling interface and registered through the tool registry.

#### Tool Registry

The Tool Registry (`lib/chat-engine/tools/registry.ts`) provides a centralized registration and configuration system for tools:

```typescript
export function createToolSet(options: {
  useKnowledgeBase?: boolean;
  useWebScraper?: boolean;
  useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
  // Tool selection based on options
}
```

#### Knowledge Base Tool

The Knowledge Base Tool (`lib/chat-engine/tools/knowledge-base.ts`) provides access to the RAG system:

```typescript
export const knowledgeBaseTool = tool({
  description: "Retrieves information from the knowledge base...",
  parameters: knowledgeBaseSchema,
  execute: async ({ query }, { toolCallId }) => {
    // Implementation
  }
});
```

#### Web Scraper Tool

The Web Scraper Tool (`lib/chat-engine/tools/web-scraper.ts`) extracts content from URLs in user messages:

```typescript
export const webScraperTool = tool({
  description: "Scrapes content from web pages...",
  parameters: webScraperSchema,
  execute: async ({ query, urls }, { toolCallId }) => {
    // Implementation
  }
});
```

#### DeepSearch Tool

The DeepSearch Tool (`lib/chat-engine/tools/deep-search.ts`) provides real-time web search capabilities:

```typescript
export const deepSearchTool = tool({
  description: "Search the web for up-to-date information...",
  parameters: deepSearchSchema,
  execute: async ({ search_term }, runOptions) => {
    // Implementation
  }
});
```

### 3. Caching System

The caching system is implemented as a layered architecture with domain-specific methods for different types of content.

#### Redis Client

The Redis client (`lib/cache/redis-client.ts`) provides the low-level caching interface with fallback to an in-memory cache:

```typescript
export const redisCache = {
  async set(key: string, value: any, ttl?: number): Promise<void> {
    // Implementation
  },
  
  async get(key: string): Promise<any> {
    // Implementation
  },
  
  // Domain-specific methods
  async getRAG(tenantId: string, query: string): Promise<any> {
    // Implementation
  },
  
  async setRAG(tenantId: string, query: string, result: any): Promise<void> {
    // Implementation
  },
  
  // Additional methods...
};
```

#### Chat Engine Cache Service

The Chat Engine Cache Service (`lib/chat-engine/cache-service.ts`) provides a higher-level interface with proper namespacing and TTL management:

```typescript
export class ChatEngineCache {
  constructor(namespace: string = 'chat-engine') {
    // Initialization
  }
  
  async setEmbedding(query: string, embedding: number[]): Promise<void> {
    // Implementation
  }
  
  async getEmbedding(query: string): Promise<number[] | null> {
    // Implementation
  }
  
  async setScrapedContent(url: string, content: string): Promise<void> {
    // Implementation
  }
  
  async getScrapedContent(url: string): Promise<string | null> {
    // Implementation
  }
  
  // Additional methods...
}
```

### 4. Authentication System

Authentication is integrated directly into the Chat Engine:

```typescript
// In lib/chat-engine/core.ts
private async handleAuth(req: Request): Promise<{ userId: string | undefined, error?: Response }> {
  // Implementation
}
```

This supports both token-based and cookie-based authentication, with fallback mechanisms for guest access when appropriate.

### 5. Logging System

A comprehensive logging system is implemented for both server and edge environments:

#### Edge Logger

The Edge Logger (`lib/logger/edge-logger.ts`) is optimized for edge runtime environments:

```typescript
export const edgeLogger = {
  debug(message: string, context?: Record<string, any>): void {
    // Implementation
  },
  
  info(message: string, context?: Record<string, any>): void {
    // Implementation
  },
  
  warn(message: string, context?: Record<string, any>): void {
    // Implementation
  },
  
  error(message: string, context?: Record<string, any>): void {
    // Implementation
  }
};
```

### 6. Chat API Route

The Chat API Route (`app/api/chat/route.ts`) provides the HTTP interface for the Chat Engine:

```typescript
export async function POST(req: Request) {
  // Extract request body, validate, and process
  const { agentType, config: agentConfig } = await detectAgentType(
    lastUserMessage.content as string,
    requestedAgentId as any
  );
  
  // Create tools based on agent configuration
  const tools = createToolSet({
    useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
    useWebScraper: agentConfig.toolOptions.useWebScraper,
    useDeepSearch: shouldUseDeepSearch
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
3. Chat API routes the request to the appropriate agent based on content analysis
4. Agent selects appropriate tools based on configuration
5. Tools are executed as needed to retrieve relevant information
6. AI generates a streaming response with reference to tools used
7. Conversation is persisted to the database for future context

### Tool Execution Flow

1. The Chat Engine receives a user query
2. The AI model determines which tools to use
3. Tools are executed with appropriate parameters
4. Tool results are collected and added to the prompt context
5. The AI model generates a response incorporating tool results
6. The response is streamed back to the user

## Performance Optimization Techniques

1. **Redis Caching**: Comprehensive caching for RAG queries, web scraping, and DeepSearch
2. **Streaming Responses**: Immediate response start with progressive rendering
3. **Conditional Tool Execution**: Tools only run when needed to reduce latency
4. **In-Memory Fallbacks**: Graceful degradation when external services are unavailable
5. **Optimized Message Loading**: Only loading necessary message history from the database
6. **Client Disconnect Handling**: Processing continues even when clients disconnect

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