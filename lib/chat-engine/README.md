# Chat Engine

This directory contains the core chat engine implementation for the San Diego project. The chat engine is responsible for processing requests, generating responses using AI models, and managing persistence of messages.

## Architecture

The Chat Engine follows a modular design with these key components:

- **Core Engine (`core.ts`)**: Main controller for handling chat requests, maintaining context, and coordinating between components
- **Tools System (`tools/`)**: Pluggable tools that enhance AI capabilities (knowledge base, web scraping, etc.)
- **Message Persistence (`message-persistence.ts`)**: Direct database integration for saving and retrieving messages
- **Cache Service (`cache-service.ts`)**: Redis-based caching for performance optimization

## Recent Improvements

### 1. Client Disconnect Handling

The Chat Engine now implements Vercel AI SDK's `consumeStream()` pattern to ensure message processing continues even if clients disconnect. This enhances reliability by:

```typescript
// Consume the stream in the background to ensure all callbacks are triggered
// even if the client disconnects from the HTTP response
result.consumeStream();

edgeLogger.info('Stream consumption enabled to ensure processing completes', {
    operation: this.config.operationName,
    sessionId: context.sessionId
});
```

This pattern ensures that message persistence, logging, and other callbacks complete successfully regardless of client connection status, improving the overall robustness of the chat system.

### 2. Single Message Optimization

The Chat Engine optimizes network traffic by implementing Vercel AI SDK's `experimental_prepareRequestBody` to only send the last message to the server:

```typescript
experimental_prepareRequestBody({ messages, id }) {
  // Get the last message
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  // Return optimized payload
  return {
    message: lastMessage,
    id,
    deepSearchEnabled: deepSearchEnabled === true,
    agentId: selectedAgentId
  };
}
```

The server then loads previous messages from the database and appends the new message, reducing bandwidth usage and improving performance.

### 3. Redundant Error Handling

The Message Persistence service has been refactored to remove redundant error handling patterns and implement consistent logging:

- Added a centralized `logError` helper function that standardizes error logging across the service
- Consolidated Supabase client creation in a reusable `createSupabaseClient` method
- Improved error handling for RPC failures with proper fallback mechanisms
- Enhanced execution time tracking for performance monitoring

## Message Persistence

The Chat Engine uses a direct Supabase database integration for message persistence. The `MessagePersistenceService` handles:

1. **Saving messages**: Both user and assistant messages are saved to the `sd_chat_histories` table through the `save_message_and_update_session` RPC function
2. **Loading messages**: Historical messages are loaded directly from the database for conversation context
3. **Transaction safety**: The RPC function handles session creation/updates and message insertion in a single transaction
4. **Client disconnect resilience**: Messages are saved even if the client disconnects mid-conversation

### How It Works

1. When a user sends a message, it is processed by the Chat Engine and saved to the database via `saveUserMessage()`
2. The AI generates a response with potential tool usage
3. The assistant's response is saved to the database via `saveAssistantMessage()`, including any tool usage information
4. Future conversations load previous messages directly from the database using `loadPreviousMessages()`

Both saves are performed asynchronously to prevent blocking the UI, with appropriate error handling and logging.

## Configuration

The Chat Engine can be configured through the `ChatEngineConfig` interface:

```typescript
export interface ChatEngineConfig {
    tools: Record<string, Function>;      // Tools to make available to the AI
    requiresAuth: boolean;                // Whether authentication is required
    corsEnabled: boolean;                 // Enable CORS for API routes
    model: string;                        // AI model to use (e.g., 'gpt-4o')
    temperature?: number;                 // Temperature for generation (default: 0.7)
    maxTokens?: number;                   // Maximum tokens to generate (default: 1500)
    operationName?: string;               // Operation name for logging
    cacheEnabled?: boolean;               // Enable caching (default: true)
    messageHistoryLimit?: number;         // Maximum messages to include in history (default: 50)
    useDeepSearch?: boolean;              // Enable deep search feature
    messagePersistenceDisabled?: boolean; // Disable saving messages to database
    prompts?: Record<string, string>;     // System prompts to use
    agentType?: string;                   // Type of agent (e.g., 'default', 'copywriting')
    body?: any;                           // Additional request body parameters
}
```

## Usage

```typescript
import { createChatEngine } from '@/lib/chat-engine/core';
import { knowledgeBaseTool } from '@/lib/chat-engine/tools/knowledge-base';
import { webScraperTool } from '@/lib/chat-engine/tools/web-scraper';

// Create a chat engine with tools
const chatEngine = createChatEngine({
    tools: {
        knowledgeBase: knowledgeBaseTool,
        webScraper: webScraperTool
    },
    requiresAuth: true,
    corsEnabled: true,
    model: 'gpt-4o',
    temperature: 0.7,
    operationName: 'main_chat'
});

// Handle incoming requests
export async function POST(req: Request) {
    return chatEngine.handleRequest(req);
}
```

## Temporary Chat Mode

The engine supports a temporary chat mode where messages are not saved to the database. This is useful for testing or when persistence is not needed:

```typescript
// In your route handler
export async function POST(req: Request) {
    const { disable_persistence } = await req.json();
    
    const engine = createChatEngine({
        // ...other config
        messagePersistenceDisabled: disable_persistence === true
    });
    
    return engine.handleRequest(req);
}
```

When `messagePersistenceDisabled` is set to `true`, the engine will still function normally but will not save any messages to the database. 