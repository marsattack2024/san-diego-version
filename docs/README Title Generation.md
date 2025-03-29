Goal: Implement backend AI title generation using GPT-3.5 Turbo, triggered asynchronously via the Vercel AI SDK's onFinish callback after the first user message. Update the title directly in Supabase.

# Chat Title Generation Implementation Plan

## Current System Analysis

Current title generation is client-side implemented in the `stores/chat-store.ts` file:
- Simple substring of the first user message 
- Applies only when title is "New Chat" or "Untitled Conversation"
- Uses a setTimeout to update the title in the database
- Lacks consistency when users refresh or access from different devices
- Doesn't leverage AI to create more meaningful titles

## Implementation Strategy

### Phase 1: Create Title Service Infrastructure

#### 1. Create Title Logger (lib/logger/title-logger.ts)

```typescript
import { edgeLogger } from '@/lib/logger/edge-logger';

export const titleLogger = {
  attemptGeneration: ({ chatId }: { chatId: string }) => {
    edgeLogger.info('Attempting title generation', {
      category: 'chat_title',
      operation: 'generate_attempt',
      chatId
    });
  },
  
  titleGenerated: ({ chatId, generatedTitle }: { 
    chatId: string, 
    generatedTitle: string
  }) => {
    edgeLogger.info('Title generated successfully', {
      category: 'chat_title',
      operation: 'generation_success',
      chatId,
      generatedTitle
    });
  },
  
  titleGenerationFailed: ({ chatId, error }: { 
    chatId: string, 
    error: string 
  }) => {
    edgeLogger.error('Title generation failed', {
      category: 'chat_title',
      operation: 'generation_error',
      chatId,
      error
    });
  },
  
  titleUpdateResult: ({ chatId, newTitle, success, error }: { 
    chatId: string, 
    newTitle: string, 
    success: boolean, 
    error?: string 
  }) => {
    if (success) {
      edgeLogger.info('Title updated in database', {
        category: 'chat_title',
        operation: 'db_update_success',
        chatId,
        newTitle
      });
    } else {
      edgeLogger.error('Failed to update title in database', {
        category: 'chat_title',
        operation: 'db_update_error',
        chatId,
        error
      });
    }
  }
};
```

#### 2. Create Title Generation Service (lib/chat/title-service.ts)

```typescript
import { titleLogger } from '@/lib/logger/title-logger';
import { createClient } from '@/utils/supabase/server';
import { cacheService } from '@/lib/cache/cache-service';
import { openai } from '@ai-sdk/openai';

// Cache keys
const TITLE_GENERATION_ATTEMPTS_KEY = 'title_generation:attempts';
const TITLE_GENERATION_LOCK_KEY = 'title_generation:lock';

/**
 * Clean and validate a title from the AI response
 */
function cleanTitle(rawTitle: string): string {
  // Remove quotes that GPT often adds
  let cleanedTitle = rawTitle.trim().replace(/^["']|["']$/g, '');
  
  // Truncate if too long (50 chars max)
  if (cleanedTitle.length > 50) {
    cleanedTitle = cleanedTitle.substring(0, 47) + '...';
  }
  
  // Make sure it's not empty
  if (!cleanedTitle) {
    return 'Chat Summary';
  }
  
  return cleanedTitle;
}

/**
 * Fetch the current title from the database
 */
async function getCurrentTitle(chatId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('sd_chat_sessions')
      .select('title')
      .eq('id', chatId)
      .single();
      
    if (error) {
      throw new Error(`Failed to fetch current title: ${error.message}`);
    }
    
    return data?.title || null;
  } catch (error) {
    titleLogger.titleUpdateResult({
      chatId,
      newTitle: 'Error fetching current title',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Update the title in the database
 */
async function updateTitleInDatabase(chatId: string, newTitle: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('sd_chat_sessions')
      .update({
        title: newTitle,
        updated_at: new Date().toISOString()
      })
      .eq('id', chatId);
      
    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }
    
    // Invalidate history cache to ensure the sidebar shows the new title
    try {
      await fetch('/api/history/invalidate', { method: 'POST' });
    } catch (cacheError) {
      // Ignore cache invalidation errors, non-critical
    }
    
    return true;
  } catch (error) {
    titleLogger.titleUpdateResult({
      chatId,
      newTitle,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Generate and save a title for a chat session based on first user message
 * Uses Redis for rate limiting and locking to prevent duplicate work
 */
export async function generateAndSaveChatTitle(
  chatId: string,
  firstUserMessageContent: string
): Promise<void> {
  // Skip if no message content
  if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
    return;
  }
  
  try {
    titleLogger.attemptGeneration({ chatId });
    
    // Check rate limiting - maximum 10 generation attempts per minute
    const currentAttempts = await cacheService.incrementCounter(
      `${TITLE_GENERATION_ATTEMPTS_KEY}:global`, 
      1, 
      60
    );
    
    if (currentAttempts && currentAttempts > 10) {
      titleLogger.titleGenerationFailed({
        chatId,
        error: 'Rate limit exceeded for title generation'
      });
      return;
    }
    
    // Try to acquire lock to prevent multiple parallel generation attempts
    const lockAcquired = await cacheService.setNX(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`, 'locked', 30);
    if (!lockAcquired) {
      titleLogger.titleGenerationFailed({
        chatId,
        error: 'Another title generation is already in progress'
      });
      return;
    }
    
    try {
      // Check if title is still default
      const currentTitle = await getCurrentTitle(chatId);
      if (currentTitle !== 'New Chat' && currentTitle !== 'Untitled Conversation' && currentTitle !== null) {
        return;
      }
      
      // Truncate message for API call if needed
      const truncatedMessage = firstUserMessageContent.length > 1000 
        ? firstUserMessageContent.substring(0, 1000) + '...'
        : firstUserMessageContent;
      
      // Generate title using OpenAI via AI SDK
      const { messages } = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates concise, descriptive titles for chat conversations. Create a title that summarizes the main topic or intent of the user message in 5-7 words. Do not use quotes in your response.'
          },
          {
            role: 'user',
            content: truncatedMessage
          }
        ],
        max_tokens: 30,
        temperature: 0.7
      });
      
      // Extract and clean the title
      const generatedTitle = messages[messages.length - 1].content;
      const cleanedTitle = cleanTitle(generatedTitle || 'Chat Conversation');
      
      titleLogger.titleGenerated({
        chatId,
        generatedTitle: cleanedTitle
      });
      
      // Update the title in the database
      const success = await updateTitleInDatabase(chatId, cleanedTitle);
      
      if (success) {
        titleLogger.titleUpdateResult({
          chatId,
          newTitle: cleanedTitle,
          success: true
        });
      }
    } finally {
      // Release the lock when done
      await cacheService.del(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
    }
  } catch (error) {
    titleLogger.titleGenerationFailed({
      chatId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Attempt to set a default title if we failed to generate one
    try {
      const defaultTitle = 'Chat ' + new Date().toLocaleDateString();
      await updateTitleInDatabase(chatId, defaultTitle);
    } catch (fallbackError) {
      // Fallback error can be safely ignored
    }
  }
}
```

### Phase 2: Integration with Chat Engine

#### Modify Chat Engine Core (lib/chat-engine/core.ts)

Find the `onFinish` callback in the `processRequest` method of the ChatEngine class and modify it:

```typescript
// Add onFinish callback to save the assistant message
async onFinish({ text, response }) {
  // Existing code to save assistant message...
  
  try {
    // Extract any tool usage information from the response
    const toolsUsed = text.includes('Tools and Resources Used')
      ? self.extractToolsUsed(text)
      : undefined;
    
    // Save the assistant message to the database
    await self.saveAssistantMessage(context, text, toolsUsed);
    
    edgeLogger.info('Successfully saved assistant message in onFinish', {
      operation: operationName,
      sessionId,
      contentLength: text.length,
      hasToolsUsed: !!toolsUsed,
      requestId
    });
    
    // NEW TITLE GENERATION CODE
    // Check if this is the first message in the conversation
    // We can do this by checking the message history length
    const { data: messageCount, error: countError } = await supabase
      .from('sd_chat_histories')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
      
    if (!countError && messageCount && messageCount.count <= 2) { // 2 because we just saved the assistant message
      // Find the first user message in the context
      const firstUserMessage = context.messages.find(m => m.role === 'user');
      if (firstUserMessage && firstUserMessage.content) {
        // Import title service and generate title asynchronously (fire and forget)
        try {
          const { generateAndSaveChatTitle } = await import('@/lib/chat/title-service');
          
          // Don't await this to avoid blocking the response
          generateAndSaveChatTitle(sessionId, firstUserMessage.content as string)
            .catch(titleError => {
              edgeLogger.error('Unhandled exception in title generation', {
                category: 'chat_title',
                operation: 'title_generation_error',
                chatId: sessionId,
                error: titleError instanceof Error ? titleError.message : String(titleError)
              });
            });
        } catch (importError) {
          edgeLogger.error('Failed to import title service', {
            category: 'chat_title',
            operation: 'title_import_error',
            error: importError instanceof Error ? importError.message : String(importError)
          });
        }
      }
    }
  } catch (error) {
    edgeLogger.error('Failed to save assistant message in onFinish callback', {
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      userId: logUserId,
      requestId
    });
  }
}
```

### Phase 3: Remove Old Client-Side Title Generation

#### Modify Chat Store (stores/chat-store.ts)

Remove the title generation logic from the `addMessage` method:

```typescript
addMessage: (message) => {
  const { currentConversationId, conversations } = get();
  if (!currentConversationId) return;

  const messageWithId = message.id ? message : { ...message, id: uuidv4() };
  const timestamp = new Date().toISOString();

  // REMOVE THIS TITLE GENERATION BLOCK
  /*
  // Generate title from first user message if title is default
  let newTitle = conversations[currentConversationId].title;
  if (message.role === 'user') {
    const currentTitle = conversations[currentConversationId].title;
    // Auto-generate title from user message
    if (currentTitle === 'New Chat' || currentTitle === 'Untitled Conversation' || !currentTitle) {
      newTitle = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
      console.log(`[ChatStore] Auto-generating title: "${newTitle}" from message: "${message.content}"`);

      // Update title in the database
      if (typeof window !== 'undefined') {
        setTimeout(async () => {
          try {
            console.debug(`[ChatStore] Updating chat title in database: ${currentConversationId} to "${newTitle}"`);
            await fetch(`/api/chat/${currentConversationId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: newTitle })
            });
          } catch (error) {
            console.error('Failed to update chat title in database:', error);
          }
        }, 100);
      }
    }
  }
  */

  // Just update conversation with new message, no title changes
  set({
    conversations: {
      ...conversations,
      [currentConversationId]: {
        ...conversations[currentConversationId],
        messages: [...conversations[currentConversationId].messages, messageWithId],
        updatedAt: timestamp
        // No title update here anymore
      }
    }
  });
},
```

## Implementation Benefits

1. **Reliable Backend Processing**
   - Title generation happens on the server, ensuring consistency
   - Uses onFinish callback for proper integration with the chat lifecycle
   - Only triggers on conversations with 2 or fewer messages

2. **Advanced Features**
   - Rate limiting using Redis cache (10 requests per minute)
   - Locking mechanism to prevent duplicate work
   - Proper error handling with fallback titles
   - Cache invalidation for UI updates

3. **Simplified Client**
   - Removes client-side title generation logic
   - Single source of truth in the database
   - No need for manual setTimeout handling

4. **AI-Powered Titles**
   - Better contextual understanding of conversation
   - More descriptive and professional titles
   - Configurable prompt for different title styles

## Testing Plan

1. **Basic Functionality Test**
   - Create a new chat and send a message
   - Check logs for title generation attempts
   - Verify title is updated in Supabase
   - Confirm sidebar updates with new title

2. **Content Tests**
   - Test with different message types (questions, statements, etc.)
   - Test with very short and very long messages

3. **Error Handling Test**
   - Test with OpenAI API unavailable (mock)
   - Test with database errors (mock)
   - Test with Redis unavailable

## Implementation Notes

- This implementation leverages existing Redis cache for rate limiting and locking
- Uses dynamic import for the title service to avoid circular dependencies
- Integrates with existing logging patterns and error handling
- Fire-and-forget pattern prevents blocking the main chat response
- Compatible with existing manual title editing functionality

## Implementation Plan

### Step 1: Create Title Logger (lib/logger/title-logger.ts)
Create this file with the logger implementation as described above.

### Step 2: Create Title Generation Service (lib/chat/title-service.ts)
Create this file with the title generation service implementation as described above.

### Step 3: Modify Chat Engine (lib/chat-engine/core.ts)
Find the `onFinish` callback in the `processRequest` method of the ChatEngine class and add the title generation code as described above.

### Step 4: Remove Client-Side Title Generation (stores/chat-store.ts)
Remove the title generation logic from the `addMessage` method as described above.

### Step 5: Testing
1. Create a new test chat
2. Send a first message
3. Verify in logs that title generation was triggered
4. Check the database to confirm the title was updated
5. Verify the sidebar updates to show the new AI-generated title

### Step 6: Documentation & Monitoring
1. Update project documentation to indicate the new feature
2. Monitor logs for any issues with title generation
3. Track API usage to ensure we're not exceeding rate limits

This implementation prioritizes:
- Server-side consistency
- Minimal client changes
- Leveraging existing Redis infrastructure
- Non-blocking operation
- Proper error handling with fallbacks

The integration with the onFinish callback ensures that we're following the Vercel AI SDK patterns properly while maintaining compatibility with the rest of the system.

## Complete Implementation

As of the last update, we have successfully implemented the server-side AI-powered title generation feature with the following components:

### Completed Components

✅ **Title Logger (lib/logger/title-logger.ts)**
- Created specialized logger for title generation operations
- Implemented methods for tracking generation attempts, successes, and failures
- Integrated with existing edge logger for consistent logging patterns

✅ **Title Service (lib/chat/title-service.ts)**
- Implemented core title generation functionality using OpenAI
- Added title cleaning and validation
- Created database interaction methods for fetching and updating titles
- Implemented rate limiting and locking mechanisms to prevent duplicate processing
- Added fallback title generation for graceful degradation

✅ **Chat Engine Integration (lib/chat-engine/core.ts)**
- Modified the onFinish callback to detect the first user message
- Added message count check to trigger title generation only on new conversations
- Implemented dynamic import of title service to avoid circular dependencies
- Added comprehensive error handling and logging

✅ **Client-Side Cleanup (stores/chat-store.ts)**
- Removed client-side title generation from the addMessage method
- Eliminated client-side database updates for titles
- Maintained backward compatibility with existing code

### Key Features Implemented

1. **Server-side Processing** - Titles are now generated and stored on the server
2. **AI-Powered Titles** - Using GPT-3.5 Turbo for contextually relevant titles
3. **Rate Limiting** - Maximum 10 generation attempts per minute
4. **Locking Mechanism** - Prevents duplicate work with Redis locks
5. **Asynchronous Processing** - Non-blocking implementation with fire-and-forget pattern
6. **Fallback Generation** - Graceful degradation when AI generation fails
7. **Comprehensive Logging** - Detailed logs for monitoring and debugging

The implementation follows the server-side architecture outlined in the plan and leverages the Vercel AI SDK's callbacks for seamless integration into the chat lifecycle.

## Next Steps

### Testing and Validation
1. Create a new test chat and verify title generation works end-to-end
2. Test with different message types to ensure quality of generated titles
3. Monitor logs for any errors or unexpected behavior
4. Verify that the title appears correctly in the sidebar

### Optimizations
1. Consider caching generated titles for faster retrieval
2. Implement batch processing for high-volume scenarios
3. Explore using different GPT models for different quality/cost tradeoffs

### Monitoring
1. Set up alerts for title generation failures
2. Monitor OpenAI API usage to ensure we stay within rate limits
3. Track user satisfaction with generated titles (potential future feature)