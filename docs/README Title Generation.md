Goal: Implement backend AI title generation using Vercel AI SDK with OpenAI, triggered asynchronously via the Vercel AI SDK's onFinish callback after the first user message. Update the title directly in Supabase.

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
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Performance thresholds for title generation
const TITLE_THRESHOLDS = {
    SLOW_OPERATION: 2000,    // 2 seconds (triggers level=warn, slow=true)
    IMPORTANT_THRESHOLD: 5000 // Mark important=true if durationMs > 5000
};

// Mask user ID for logging
const maskUserId = (userId: string): string => {
    if (!userId) return 'unknown';
    return userId.substring(0, 4) + '...' + userId.substring(userId.length - 4);
};

/**
 * Specialized logger for title generation operations
 * Provides consistent logging patterns for all title-related operations
 */
export const titleLogger = {
    attemptGeneration: ({ chatId, userId }: { chatId: string; userId?: string }) => {
        edgeLogger.info('Attempting title generation', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_attempt',
            chatId,
            userId: userId ? maskUserId(userId) : undefined
        });
    },

    titleGenerated: ({ chatId, generatedTitle, durationMs, userId }: {
        chatId: string,
        generatedTitle: string,
        durationMs: number,
        userId?: string
    }) => {
        const isSlow = durationMs > TITLE_THRESHOLDS.SLOW_OPERATION;
        const isImportant = durationMs > TITLE_THRESHOLDS.IMPORTANT_THRESHOLD;

        if (isSlow) {
            edgeLogger.warn('Title generated successfully', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_success',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                titlePreview: generatedTitle.substring(0, 30) + (generatedTitle.length > 30 ? '...' : ''),
                durationMs,
                slow: isSlow,
                important: isImportant
            });
        } else {
            edgeLogger.info('Title generated successfully', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_success',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                titlePreview: generatedTitle.substring(0, 30) + (generatedTitle.length > 30 ? '...' : ''),
                durationMs,
                slow: isSlow,
                important: isImportant
            });
        }
    },

    // Additional logging methods for various title service operations
    titleGenerationFailed: ({ chatId, error, durationMs, userId }: {
        chatId: string,
        error: string,
        durationMs: number,
        userId?: string
    }) => {
        edgeLogger.error('Title generation failed', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_error',
            chatId,
            userId: userId ? maskUserId(userId) : undefined,
            error,
            durationMs,
            important: true
        });
    },

    // ...and other logging methods for various operations
};
```

#### 2. Create Title Generation Service (lib/chat/title-service.ts)

```typescript
import { titleLogger } from '@/lib/logger/title-logger';
import { createClient } from '@/utils/supabase/server';
import { cacheService } from '@/lib/cache/cache-service';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

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
async function getCurrentTitle(chatId: string, userId?: string): Promise<string | null> {
  const startTime = performance.now();
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
    
    const durationMs = Math.round(performance.now() - startTime);

    if (data?.title && data.title !== 'New Chat' && data.title !== 'Untitled Conversation') {
      titleLogger.titleExists({
        chatId,
        currentTitle: data.title,
        userId
      });
    }
    
    return data?.title || null;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    titleLogger.titleUpdateResult({
      chatId,
      newTitle: 'Error fetching current title',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
      userId
    });
    return null;
  }
}

/**
 * Update the title in the database
 */
async function updateTitleInDatabase(chatId: string, newTitle: string, userId?: string): Promise<boolean> {
  const startTime = performance.now();
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
    
    const durationMs = Math.round(performance.now() - startTime);
    titleLogger.titleUpdateResult({
      chatId,
      newTitle,
      success: true,
      durationMs,
      userId
    });
    
    return true;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    titleLogger.titleUpdateResult({
      chatId,
      newTitle,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
      userId
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
  firstUserMessageContent: string,
  userId?: string
): Promise<void> {
  // Skip if no message content
  if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
    return;
  }
  
  const startTime = performance.now();
  let lockAcquired = false;
  
  try {
    titleLogger.attemptGeneration({ chatId, userId });
    
    // Try to acquire lock to prevent multiple parallel generation attempts
    const lockStartTime = performance.now();
    const lockExists = await cacheService.exists(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
    lockAcquired = !lockExists;
    if (lockAcquired) {
      await cacheService.set(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`, 'locked', { ttl: 30 });
    } else {
      titleLogger.lockAcquisitionFailed({ chatId, userId });
      return;
    }
    const lockDurationMs = Math.round(performance.now() - lockStartTime);
    
    // Check rate limiting - maximum 10 generation attempts per minute
    let currentAttempts = 0;
    const counterKey = `${TITLE_GENERATION_ATTEMPTS_KEY}:global`;
    const existingCounter = await cacheService.get<number>(counterKey);
    if (existingCounter) {
      currentAttempts = existingCounter + 1;
    } else {
      currentAttempts = 1;
    }
    await cacheService.set(counterKey, currentAttempts, { ttl: 60 });
    
    if (currentAttempts && currentAttempts > 10) {
      titleLogger.rateLimitExceeded({ chatId, userId });
      return;
    }
    
    try {
      // Check if title is still default
      const currentTitle = await getCurrentTitle(chatId, userId);
      if (currentTitle !== 'New Chat' && currentTitle !== 'Untitled Conversation' && currentTitle !== null) {
        return;
      }
      
      // Truncate message for API call if needed
      const truncatedMessage = firstUserMessageContent.length > 1000 
        ? firstUserMessageContent.substring(0, 1000) + '...'
        : firstUserMessageContent;
      
      // Generate title using Vercel AI SDK with OpenAI
      const result = await generateText({
        model: openai('gpt-3.5-turbo'),
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
        maxTokens: 30,
        temperature: 0.7
      });
      
      // Extract and clean the title
      const cleanedTitle = cleanTitle(result.text || 'Chat Conversation');
      
      const titleGenerationDurationMs = Math.round(performance.now() - startTime);
      titleLogger.titleGenerated({
        chatId,
        generatedTitle: cleanedTitle,
        durationMs: titleGenerationDurationMs,
        userId
      });
      
      // Update the title in the database
      await updateTitleInDatabase(chatId, cleanedTitle, userId);
    } finally {
      // Release the lock when done
      if (lockAcquired) {
        await cacheService.delete(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
      }
    }
  } catch (error) {
    const errorDurationMs = Math.round(performance.now() - startTime);
    titleLogger.titleGenerationFailed({
      chatId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: errorDurationMs,
      userId
    });
    
    // Attempt to set a default title if we failed to generate one
    try {
      const defaultTitle = 'Chat ' + new Date().toLocaleDateString();
      await updateTitleInDatabase(chatId, defaultTitle, userId);
    } catch (fallbackError) {
      // Fallback error can be safely ignored
    } finally {
      // Make sure lock is released even if fallback fails
      if (lockAcquired) {
        await cacheService.delete(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
      }
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
          generateAndSaveChatTitle(sessionId, firstUserMessage.content as string, context.userId)
            .catch(titleError => {
              edgeLogger.error('Unhandled exception in title generation', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_error',
                chatId: sessionId,
                error: titleError instanceof Error ? titleError.message : String(titleError),
                userId: context.userId
              });
            });
        } catch (importError) {
          edgeLogger.error('Failed to import title service', {
            category: LOG_CATEGORIES.CHAT,
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

  // Just update conversation with new message, no title changes
  set({
    conversations: {
      ...conversations,
      [currentConversationId]: {
        ...conversations[currentConversationId],
        messages: [...conversations[currentConversationId].messages, messageWithId],
        updatedAt: timestamp
      }
    }
  });
},
```

## Implementation Benefits

1. **Reliable Backend Processing**
   - Title generation happens on the server, ensuring consistency
   - Uses Vercel AI SDK for proper AI integration
   - Only triggers on conversations with 2 or fewer messages

2. **Advanced Features**
   - Performance tracking with thresholds for slow operations
   - User ID tracking for better analytics and debugging
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
   - Test with API unavailable (mock)
   - Test with database errors (mock)
   - Test with Redis unavailable
   - Verify fallback title generation works

4. **Performance Tests**
   - Monitor duration of title generation operations
   - Verify logging of slow operations
   - Test concurrency with multiple requests

## Implementation Notes

- Uses Vercel AI SDK's `generateText` with OpenAI model for title generation
- Leverages existing Redis cache for rate limiting and locking
- Uses dynamic import for the title service to avoid circular dependencies
- Integrates with existing logging patterns and error handling
- Fire-and-forget pattern prevents blocking the main chat response
- Compatible with existing manual title editing functionality
- Includes performance monitoring for all operations

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
- Performance tracking and monitoring

The integration with the onFinish callback ensures that we're following the Vercel AI SDK patterns properly while maintaining compatibility with the rest of the system.

## Files to Remove

The following files should be removed as they are outdated and have been replaced with the new implementation:

1. ~~Previous client-side title generation code in stores/chat-store.ts (the logic has been removed, no need to delete file)~~
2. ~~Any outdated tests that verify client-side title generation~~

## Completed Implementation

As of the last update, we have successfully implemented the server-side AI-powered title generation feature with the following components:

### Completed Components

✅ **Title Logger (lib/logger/title-logger.ts)**
- Created specialized logger for title generation operations
- Implemented methods for tracking generation attempts, successes, and failures
- Added performance tracking with thresholds for slow operations
- Integrated with existing edge logger for consistent logging patterns

✅ **Title Service (lib/chat/title-service.ts)**
- Implemented core title generation functionality using Vercel AI SDK with OpenAI
- Added title cleaning and validation
- Created database interaction methods for fetching and updating titles
- Implemented rate limiting and locking mechanisms to prevent duplicate processing
- Added fallback title generation for graceful degradation
- Added performance tracking for all operations

✅ **Chat Engine Integration (lib/chat-engine/core.ts)**
- Modified the onFinish callback to detect the first user message
- Added message count check to trigger title generation only on new conversations
- Implemented dynamic import of title service to avoid circular dependencies
- Added comprehensive error handling and logging
- Preserved user context for better debugging and analytics

✅ **Client-Side Cleanup (stores/chat-store.ts)**
- Removed client-side title generation from the addMessage method
- Eliminated client-side database updates for titles
- Maintained backward compatibility with existing code

### Key Features Implemented

1. **Server-side Processing** - Titles are now generated and stored on the server
2. **AI-Powered Titles** - Using Vercel AI SDK with OpenAI for contextually relevant titles
3. **Rate Limiting** - Maximum 10 generation attempts per minute
4. **Locking Mechanism** - Prevents duplicate work with Redis locks
5. **Asynchronous Processing** - Non-blocking implementation with fire-and-forget pattern
6. **Fallback Generation** - Graceful degradation when AI generation fails
7. **Performance Tracking** - Monitoring and logging of operation durations
8. **User Context Preservation** - Tracking user IDs for better debugging and analytics
9. **Comprehensive Logging** - Detailed logs for monitoring and debugging

The implementation follows the server-side architecture outlined in the plan and leverages the Vercel AI SDK for seamless integration into the chat lifecycle.

## Next Steps

### Testing and Validation
1. Create a new test chat and verify title generation works end-to-end
2. Test with different message types to ensure quality of generated titles
3. Monitor logs for any errors or unexpected behavior
4. Verify that the title appears correctly in the sidebar

### Optimizations
1. Consider caching generated titles for faster retrieval
2. Implement batch processing for high-volume scenarios
3. Explore using different models for different quality/cost tradeoffs
4. Add more advanced analytics for title generation operations

### Monitoring
1. Set up alerts for title generation failures
2. Monitor API usage to ensure we stay within rate limits
3. Track user satisfaction with generated titles (potential future feature)