# Message Persistence System Upgrade

This document outlines the changes made to the message persistence system in the San Diego chat application, which now works in conjunction with the Zustand store for state management.

## Background

Previously, the chat system used this approach for message handling:

1. **In-Memory State**: Maintained messages in React state
2. **RPC Function Calls**: Saved messages to the database in a separate process

This dual approach caused several issues:
- Occasional message loss when cache and database got out of sync
- Inconsistent conversation history between sessions
- Complex debugging due to two separate persistence mechanisms
- Additional Redis overhead for data already stored in Supabase

## Solution

We consolidated message handling by creating a unified `MessagePersistenceService` that:

1. Directly interacts with the Supabase database for both saving and loading messages
2. Eliminates the need for Redis caching of conversation history
3. Provides consistent conversation context directly from the source of truth
4. Captures and stores tool usage data for analytics and debugging
5. Integrates with Zustand store for state management

## Recent Improvements

### 1. Consistent Error Handling

We've implemented a centralized approach to error handling that reduces redundancy and improves maintainability:

```typescript
/**
 * Helper function to log errors consistently
 */
function logError(logger: typeof edgeLogger, operation: string, error: unknown, context: Record<string, any> = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`Error in ${operation}`, {
        operation,
        error: errorMessage,
        stack: errorStack,
        ...context
    });

    return errorMessage;
}
```

This standardized approach:
- Ensures uniform error reporting across the service
- Captures both error messages and stack traces
- Adds contextual information for better debugging
- Simplifies error handling code throughout the service

### 2. Supabase Client Abstraction

We've consolidated Supabase client creation into a reusable method:

```typescript
/**
 * Creates a Supabase client based on configuration
 * Uses admin client if bypassAuth is true, with fallback to standard client
 */
private async createSupabaseClient(context: Record<string, any> = {}) {
    const useAdminClient = this.config.bypassAuth === true;
    try {
        if (useAdminClient) {
            edgeLogger.info('Using admin client to bypass RLS', {
                operation: this.operationName,
                ...context
            });
            return await createAdminClient();
        } else {
            return await createClient();
        }
    } catch (error) {
        logError(edgeLogger, this.operationName, error, {
            useAdminClient,
            ...context,
            action: 'creating_client'
        });

        // Fall back to the standard client if admin client fails
        if (useAdminClient) {
            edgeLogger.info('Falling back to standard client', {
                operation: this.operationName
            });
            return await createClient();
        }
        throw error;
    }
}
```

This abstraction:
- Reduces code duplication
- Implements proper fallback mechanisms
- Provides consistent error handling
- Improves maintainability

### 3. Client Disconnect Handling

We've implemented Vercel AI SDK's `consumeStream()` pattern to ensure message persistence even when clients disconnect:

```typescript
// In the chat engine's processRequest method
const result = await streamText({
    // Configuration options
});

// Consume the stream in the background to ensure all callbacks are triggered
// even if the client disconnects from the HTTP response
result.consumeStream();

edgeLogger.info('Stream consumption enabled to ensure processing completes', {
    operation: this.config.operationName,
    sessionId: context.sessionId
});
```

This enhancement:
- Ensures messages are saved to the database regardless of client connection status
- Triggers all callbacks correctly, including message persistence operations
- Improves reliability for chat sessions that span multiple sessions
- Prevents message loss when users close their browsers during responses

### 4. Single Message Optimization

We've implemented Vercel AI SDK's `experimental_prepareRequestBody` to only send the last message to the server:

```typescript
// In the frontend Chat component
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

The server then loads previous messages from the database, reducing bandwidth and improving performance.

### 5. Tool Usage Tracking

We've added comprehensive tool usage tracking in the message persistence system:

```typescript
/**
 * Interface defining the structure of tool usage data
 */
export interface ToolsUsedData {
    // From text extraction
    tools?: string[];

    // From AI SDK tool calls
    api_tool_calls?: Array<{
        name?: string;
        id: string;
        type: string;
    }>;

    // Any additional tool information 
    [key: string]: any;
}
```

This feature:
- Captures both explicit tool calls from the AI SDK and text-based tool references
- Stores structured data in the database for analysis and debugging
- Integrates seamlessly with the existing message persistence flow
- Provides insights into which tools are most frequently used

## Key Changes

1. **Created `message-persistence.ts`**:
   - Provides a unified interface for message operations
   - Handles both saving and loading messages directly from Supabase
   - Supports asynchronous non-blocking saves to prevent UI delays
   - Includes comprehensive error handling and logging
   - Stores structured tool usage data in the `tools_used` JSONB column

2. **Updated `core.ts` in ChatEngine**:
   - Replaced `MessageHistoryService` with `MessagePersistenceService`
   - Added helper methods for saving user and assistant messages
   - Ensured tools usage is properly extracted and saved with messages
   - Implemented configurable message persistence toggle
   - Added `consumeStream()` support for client disconnect resilience
   - Added `extractToolsUsed` method to process text-based tool references

3. **Enhanced API Route Handler**:
   - Added support for disabling persistence via request parameter
   - Improved logging for message persistence operations
   - Added consistent error handling
   - Implemented support for single message optimization
   - Added client disconnect resilience with `consumeStream()`

4. **Added Documentation**:
   - Created README for the chat engine
   - Documented the new message persistence system
   - Added documentation for tool usage tracking

## Benefits

1. **Single Source of Truth**: All messages are directly saved to and loaded from the database
2. **Simplified Architecture**: Removed the redundant caching layer for message history
3. **Improved Reliability**: Eliminated potential sync issues between cache and database
4. **Better Performance**: Reduced overhead by removing unnecessary Redis operations
5. **Enhanced Developer Experience**: Clear, consistent pattern for message handling
6. **State Management Integration**: Seamless integration with the Zustand store
7. **Temporary Chat Mode**: Added ability to disable persistence for testing/temporary chats
8. **Disconnect Resilience**: Messages are saved correctly even when clients disconnect
9. **Network Efficiency**: Reduced bandwidth usage with single message optimization
10. **Improved Maintainability**: Standardized error handling and logging patterns
11. **Tool Usage Analytics**: Captured tool usage data for insights and debugging
12. **Optimistic Updates**: Immediate UI feedback with optimistic updates

## Implementation Details

### MessagePersistenceService

```typescript
class MessagePersistenceService {
  // Save a message to the database
  async saveMessage(input: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string;
    messageId?: string;
    userId?: string;
    tools?: ToolsUsedData;
  }): Promise<MessageSaveResult> { ... }

  // Load messages from the database
  async loadPreviousMessages(
    sessionId: string,
    userId: string | undefined,
    limit = 100
  ): Promise<Message[]> { ... }

  // Combine database messages with current messages
  async getRecentHistory(
    sessionId: string,
    userId: string,
    currentMessages: Message[],
    historyLimit: number = 10
  ): Promise<Message[]> { ... }

  // Create a Supabase client 
  private async createSupabaseClient(context: Record<string, any> = {}) { ... }
}
```

### Integration with ChatEngine and Zustand Store

```typescript
// In the ChatEngine's handleRequest method
if (!this.config.messagePersistenceDisabled) {
  // Save user message
  this.saveUserMessage(sessionId, userId, lastUserMessage);
  
  // Update Zustand store with the new message
  const { addMessage } = useChatStore.getState();
  addMessage(sessionId, {
    id: messageId,
    role: 'user',
    content: lastUserMessage.content
  });
}

// In the AI completion's onFinish callback
if (!this.config.messagePersistenceDisabled) {
  // Extract any tool usage information from the response text
  const textToolsUsed = text.includes('Tools and Resources Used')
    ? self.extractToolsUsed(text)
    : undefined;

  // Extract tool calls data from the AI SDK response
  let toolsUsed = textToolsUsed;

  // Cast response to access OpenAI-specific properties
  const openAIResponse = response as unknown as {
    choices?: Array<{
      message?: OpenAI.ChatCompletionMessage
    }>
  };

  // Safely check for tool calls with proper optional chaining
  const toolCalls = openAIResponse?.choices?.[0]?.message?.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    // Add or merge with existing tools data
    toolsUsed = {
      ...toolsUsed,
      api_tool_calls: toolCalls.map((tool: OpenAI.ChatCompletionMessageToolCall) => ({
        name: tool.function?.name,
        id: tool.id,
        type: tool.type
      }))
    };
  }

  // Save the assistant message with tool usage data
  this.saveAssistantMessage(context, text, toolsUsed);
  
  // Update Zustand store with the assistant message
  const { addMessage, updateConversationTitle } = useChatStore.getState();
  addMessage(sessionId, {
    id: assistantMessageId,
    role: 'assistant',
    content: text,
    toolsUsed
  });
  
  // If this is a new conversation, also update the title
  if (firstMessageInConversation) {
    updateConversationTitle(sessionId, generatedTitle);
  }
}

// Ensure streaming completes even if client disconnects
result.consumeStream();
```

### API Route Handler

```typescript
// Check if message persistence should be disabled
const disableMessagePersistence = parseBooleanValue(body.disable_persistence);

// Create the chat engine with the detected agent configuration
const engineConfig: ChatEngineConfig = {
  // ... other config
  messagePersistenceDisabled: disableMessagePersistence
};

// Consume the response stream to ensure processing continues even if client disconnects
if (response.body && 'consumeStream' in response) {
  // Non-awaited call so we don't block the response
  (response as any).consumeStream();
}
```

## Tool Usage Persistence

The tool usage tracking system captures and stores information about which tools were used during AI interactions:

### Data Structure

The `tools_used` JSONB column in the `sd_chat_histories` table stores structured tool usage data:

```typescript
interface ToolsUsedData {
  // Text-based tool references extracted from message content
  tools?: string[];
  
  // Explicit tool calls from the AI SDK
  api_tool_calls?: Array<{
    name?: string;  // Name of the tool that was called
    id: string;     // Unique identifier for the tool call
    type: string;   // Type of tool (typically "function")
  }>;
  
  // Additional metadata (extensible)
  [key: string]: any;
}
```

### Capturing Tool Usage

Tool usage data is captured from two sources:

1. **Text-based references**: When the assistant includes a "Tools and Resources Used" section in its response, the `extractToolsUsed` method parses this section to extract structured data.

   ```typescript
   private extractToolsUsed(text: string): Record<string, any> | undefined {
     try {
       // Look for the tools and resources section
       const toolsSection = text.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);

       if (toolsSection && toolsSection[1]) {
         return {
           tools: toolsSection[1]
             .split('\n')
             .filter(line => line.trim().startsWith('-'))
             .map(line => line.trim())
         };
       }

       return undefined;
     } catch (error) {
       // Safely handle errors without interrupting the message flow
       edgeLogger.warn('Failed to extract tools used', {
         error: error instanceof Error ? error.message : String(error)
       });
       return undefined;
     }
   }
   ```

2. **AI SDK tool calls**: The Vercel AI SDK provides structured data about tool calls in the `response` object. The `onFinish` callback extracts this data by accessing `response.choices[0].message.tool_calls`.

   ```typescript
   // Cast response to access OpenAI-specific properties
   const openAIResponse = response as unknown as {
     choices?: Array<{
       message?: OpenAI.ChatCompletionMessage
     }>
   };

   // Safely check for tool calls with proper optional chaining
   const toolCalls = openAIResponse?.choices?.[0]?.message?.tool_calls;

   if (toolCalls && toolCalls.length > 0) {
     // Add or merge with existing tools data
     toolsUsed = {
       ...toolsUsed,
       api_tool_calls: toolCalls.map((tool: OpenAI.ChatCompletionMessageToolCall) => ({
         name: tool.function?.name,
         id: tool.id,
         type: tool.type
       }))
     };
   }
   ```

### Storing Tool Usage Data

The combined tool usage data is passed to the `saveAssistantMessage` method, which then calls `persistenceService.saveMessage` with the `tools` parameter. This data is stored in the `tools_used` JSONB column using either:

1. The `save_message_and_update_session` RPC function (primary method)
2. Direct database inserts (fallback method if RPC fails)

### Benefits of Tool Usage Tracking

1. **Analytics and Insights**: Understand which tools are most frequently used
2. **Debugging**: Trace issues with specific tool interactions
3. **User Experience**: Monitor and optimize tool utilization
4. **Feature Development**: Identify underutilized tools and potential improvements
5. **Performance Monitoring**: Track tool usage patterns and response times

### Access and Querying

Tool usage data can be queried using Supabase's JSONB query capabilities:

```sql
-- Find all messages where a specific tool was used
SELECT * FROM sd_chat_histories 
WHERE tools_used->'api_tool_calls' @> '[{"name": "knowledgeBase"}]';

-- Count usage of different tools
SELECT 
  jsonb_array_elements(tools_used->'api_tool_calls')->>'name' as tool_name,
  COUNT(*) as usage_count
FROM sd_chat_histories 
WHERE tools_used->'api_tool_calls' IS NOT NULL
GROUP BY tool_name
ORDER BY usage_count DESC;
```

## Future Improvements

1. **User Profile Integration**: Enhance message persistence with user profile context
2. **Analytics Support**: Add metadata for message analytics and insights
3. **Pagination**: Implement efficient pagination for loading large conversation histories
4. **Message Archiving**: Add support for archiving older messages for storage optimization
5. **Session Metadata**: Enhance session handling with additional metadata (tags, categories)
6. **Performance Metrics**: Add detailed performance tracking for message operations
7. **Batch Operations**: Support bulk message operations for improved efficiency
8. **Advanced Error Recovery**: Implement more sophisticated retry and recovery mechanisms
9. **Tool Usage Dashboard**: Create a visualization interface for tool usage analytics
10. **Tool Performance Metrics**: Track execution time and success rates for different tools

## Migration Notes

The original `MessageHistoryService` (`message-history.ts`) can be safely removed once all components have been updated to use the new `MessagePersistenceService`. No database schema changes were required for this upgrade. 