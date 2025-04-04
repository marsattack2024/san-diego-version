/**
 * Main Chat API Route
 * 
 * This route handler uses the unified chat engine to process chat requests.
 * It handles agent selection, authentication, and delegates core functionality
 * to the chat engine components.
 */

// Vercel AI SDK Core
import { Message, streamText, appendClientMessage, appendResponseMessages, generateText } from 'ai';
// Supabase & Auth
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { createRouteHandlerAdminClient } from '@/lib/supabase/route-client';
// Logging
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { titleLogger } from '@/lib/logger/title-logger';
// Utilities & Route Handling
import { errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
// Import generateUUID
import { generateUUID } from '@/lib/utils/misc-utils';
// Chat Engine & Persistence
import { MessagePersistenceService, ToolsUsedData } from '@/lib/chat-engine/message-persistence';
import { AgentOrchestrator } from '@/lib/chat-engine/services/orchestrator.service'; // Keep for now, adjust later
import { openai } from '@ai-sdk/openai'; // Example provider
import { z } from 'zod'; // For request validation
// Import AgentType
import { AgentType } from '@/lib/chat-engine/prompts';
import { createAgentToolSet, getAgentConfig } from '@/lib/chat-engine/agent-router';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth'; // Import the auth wrapper and type
import type { User } from '@supabase/supabase-js'; // Import User type
// Import necessary functions for direct title generation
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { shouldGenerateTitle } from '@/lib/chat/title-service'; // Import shouldGenerateTitle

// Define request schema for validation
// Based on useChat hook and experimental_prepareRequestBody in components/chat.tsx
export const ChatRequestSchema = z.object({
  id: z.string().uuid().optional(), // Make session ID optional for new chats
  messages: z.array(z.object({ // Expect an array of messages
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system', 'tool', 'function']), // Allow valid roles
    content: z.string(),
    createdAt: z.string().datetime().optional(),
    // Add other fields from Message type if necessary
  })).min(1), // Ensure at least one message is present
  deepSearchEnabled: z.boolean().optional(),
  agentId: z.string().optional()
});

// Infer the request body type from the schema
export type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

// Maintain existing runtime directives
export const runtime = 'edge';
export const maxDuration = 120;
export const dynamic = 'force-dynamic'; // Ensure dynamic behavior

// Define the core handler logic separately using the correct signature
const POST_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
  const operationId = `chat_${Math.random().toString(36).substring(2, 10)}`;
  const startTime = Date.now();

  // 1. Validate Request Body
  let body: ChatRequestBody;
  try {
    const validationResult = ChatRequestSchema.safeParse(await request.json());
    if (!validationResult.success) {
      throw validationResult.error; // Throw ZodError on failure
    }
    body = validationResult.data;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format error first
      const formattedError = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      edgeLogger.warn('Invalid request body', {
        category: LOG_CATEGORIES.SYSTEM,
        operationId,
        error: formattedError // Log the formatted error string
      });
      return errorResponse('Invalid request body', formattedError, 400);
    }
    // Handle non-Zod parsing errors (e.g., invalid JSON)
    edgeLogger.error('Error parsing request body', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
    return errorResponse('Error parsing request body', 'Could not parse request data', 400);
  }

  const { messages, id: sessionIdFromBody, agentId, deepSearchEnabled } = body;
  const userId = user.id; // Use user from context
  const sessionId = sessionIdFromBody || generateUUID(); // Use provided ID or generate new one

  // Initialize Persistence Service
  const persistenceService = new MessagePersistenceService({ operationName: operationId });

  // Prepare message (assuming last message is user input)
  const userMessage = messages[messages.length - 1];
  if (!userMessage || userMessage.role !== 'user') {
    return errorResponse('Invalid request: Last message must be from user', null, 400);
  }

  // Load previous messages
  const previousMessages = await persistenceService.loadMessages(sessionId, userId);

  // Convert createdAt string to Date and ensure role is explicitly 'user'
  const createdAtDate = userMessage.createdAt ? new Date(userMessage.createdAt) : new Date();
  const userMessageForAppend: Message = { // Explicitly type as Message
    id: userMessage.id,
    role: 'user', // Explicitly set role to 'user'
    content: userMessage.content,
    createdAt: createdAtDate,
  };

  // Append user message to history for context (do not save yet)
  const currentMessages = appendClientMessage({ messages: previousMessages, message: userMessageForAppend });

  // Prepare Orchestration Context (simplified example)
  const orchestrator = new AgentOrchestrator();
  const { targetModelId, contextMessages = [] } = await orchestrator.prepareContext(userMessage.content, agentId as AgentType | undefined);
  const effectiveAgentId = (agentId || 'default') as AgentType;
  const agentConfig = getAgentConfig(effectiveAgentId);
  const finalSystemPrompt = agentConfig.systemPrompt;
  const agentToolSet = createAgentToolSet(effectiveAgentId);

  // Save user message asynchronously (fire and forget before streaming)
  persistenceService.saveUserMessage(
    sessionId,
    userMessage.content,
    userId, // Use user.id from context
    userMessage.id // ID generated by useChat client
  ).catch(err => edgeLogger.error('Async user message save failed', { operationId, sessionId, error: err instanceof Error ? err.message : String(err) }));

  // Call the Vercel AI SDK streamText function
  const result = streamText({
    model: openai(targetModelId || 'gpt-4o'), // Use determined model
    messages: [...contextMessages, ...currentMessages], // Pass combined history
    system: finalSystemPrompt, // Use the agent-specific system prompt
    tools: agentToolSet, // Include the agent-specific tools
    experimental_generateMessageId: generateUUID,

    async onFinish({ response, usage, finishReason, text /* Raw text output */ }) {
      const finishTime = Date.now();
      edgeLogger.info('Stream finished, processing persistence and title gen', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'stream_onFinish',
        operationId,
        sessionId,
        durationMs: finishTime - startTime,
        usage: usage,
        finishReason: finishReason,
      });
      try {
        const assistantMessages = response.messages;
        let assistantMessageId: string | undefined;
        let assistantContent: string | any;

        // --- Save Assistant Message --- 
        if (assistantMessages && assistantMessages.length > 0) {
          assistantMessageId = assistantMessages[0].id || generateUUID();
          assistantContent = assistantMessages[0].content;

          const assistantSaveResult = await persistenceService.saveAssistantMessage(
            sessionId,
            assistantContent,
            userId, // Use user.id from context
            undefined, // TODO: Populate toolsUsed if needed
            assistantMessageId
          );
          if (!assistantSaveResult.success) {
            edgeLogger.error('Failed to save assistant message in onFinish', { operationId, sessionId, error: assistantSaveResult.error });
          }
        } else {
          edgeLogger.warn('No assistant messages found in streamText response for persistence', { operationId, sessionId });
        }

        // --- Title Generation (Moved Here) --- 
        edgeLogger.debug('Checking if title generation should run', { operationId, sessionId });
        const proceed = await shouldGenerateTitle(sessionId, userId);

        if (proceed) {
          titleLogger.attemptGeneration({ chatId: sessionId, userId });
          const llmStartTime = Date.now();
          try {
            const titleResult = await generateText({
              model: openai('gpt-3.5-turbo'), // Use a cheaper/faster model for titles
              messages: [
                { role: 'system', content: 'Create a title that summarizes the main topic or intent of the user message in 2-6 words. Do not use quotes. Keep it concise and relevant.' },
                { role: 'user', content: String(userMessage.content).substring(0, 1000) } // Ensure content is string
              ],
              maxTokens: 30,
              temperature: 0.6
            });
            const llmDurationMs = Date.now() - llmStartTime;
            const generatedTitle = cleanTitle(titleResult.text || 'Chat Summary');

            titleLogger.titleGenerated({
              chatId: sessionId, userId: userId,
              generatedTitle,
              durationMs: llmDurationMs
            });

            // Use Admin client to update DB, bypassing RLS
            const adminSupabase = await createRouteHandlerAdminClient();
            const dbUpdateSuccess = await updateTitleInDatabase(adminSupabase, sessionId, generatedTitle, userId);

            if (!dbUpdateSuccess) {
              edgeLogger.error('Failed to update title in DB from onFinish', { operationId, sessionId });
              // Logged within updateTitleInDatabase
            }

          } catch (genError) {
            titleLogger.titleGenerationFailed({
              chatId: sessionId, userId: userId,
              error: `Direct title generation failed: ${genError instanceof Error ? genError.message : String(genError)}`,
              durationMs: Date.now() - llmStartTime
            });
          }
        } else {
          edgeLogger.debug('Skipping title generation based on shouldGenerateTitle check', { operationId, sessionId });
        }

        edgeLogger.info('Persistence and title gen completed in onFinish', { operationId, sessionId });
        // TODO: Invalidate frontend history cache if necessary (e.g., using Supabase realtime or a dedicated invalidation call)

      } catch (persistOrTitleError) {
        edgeLogger.error('Error during onFinish processing (persistence or title gen)', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          sessionId,
          error: persistOrTitleError instanceof Error ? persistOrTitleError.message : String(persistOrTitleError),
          important: true
        });
      }
    },
  });

  // Return Streaming Response
  return result.toDataStreamResponse();
  // Removed outer try/catch as withAuth handles top-level errors
}; // End of POST_Handler definition

// Export the wrapped handler as the default POST endpoint
export const POST = withAuth(POST_Handler);

// Also export the unwrapped handler for testing
export { POST_Handler }; 