/**
 * Main Chat API Route
 * 
 * This route handler uses the unified chat engine to process chat requests.
 * It handles agent selection, authentication, and delegates core functionality
 * to the chat engine components.
 */

// Vercel AI SDK Core
import { streamText, appendClientMessage, appendResponseMessages } from 'ai';
// Supabase & Auth
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
// Logging
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
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

// Define request schema for validation
// Based on useChat hook and experimental_prepareRequestBody in components/chat.tsx
const chatRequestSchema = z.object({
  id: z.string().uuid(), // Session ID
  message: z.object({ // Assuming only last message is sent
    id: z.string(),
    role: z.literal('user'),
    content: z.string(),
    createdAt: z.string().datetime().optional(),
    // Add other fields if sendExtraMessageFields is true and used
  }),
  deepSearchEnabled: z.boolean().optional(),
  agentId: z.string().optional()
});

// Maintain existing runtime directives
export const runtime = 'edge';
export const maxDuration = 120;
export const dynamic = 'force-dynamic'; // Ensure dynamic behavior

/**
 * POST handler for the chat route
 * Handles creation of new chat messages and streaming responses following Vercel AI SDK standard pattern.
 */
export async function POST(request: Request): Promise<Response> {
  const operationId = `chat_${Math.random().toString(36).substring(2, 10)}`;
  const startTime = Date.now();

  edgeLogger.info('Chat POST request received', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'chat_post',
    operationId
  });

  try {
    // 1. Parse and Validate Request Body
    const body = await request.json();
    const validationResult = chatRequestSchema.safeParse(body);

    if (!validationResult.success) {
      edgeLogger.warn('Invalid chat request body', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        errors: validationResult.error.format()
      });
      return validationError('Invalid request body', validationResult.error.format());
    }

    const {
      id: sessionId,
      message: userMessage,
      deepSearchEnabled,
      agentId
    } = validationResult.data;

    // 2. Authentication
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      edgeLogger.warn('Authentication failed for chat request', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        sessionId
      });
      return unauthorizedError('Authentication required');
    }
    const userId = user.id;
    edgeLogger.info('User authenticated', {
      category: LOG_CATEGORIES.AUTH,
      operationId,
      sessionId,
      userId: userId.substring(0, 8)
    });

    // 3. Initialize Persistence Service
    const persistenceService = new MessagePersistenceService();

    // 4. Load Message History (Needed for context)
    const previousMessages = await persistenceService.loadMessages(sessionId, userId);

    // Convert createdAt string to Date for userMessage before appending
    const userMessageForAppend = {
      ...userMessage,
      createdAt: userMessage.createdAt ? new Date(userMessage.createdAt) : undefined
    };

    const currentMessages = appendClientMessage({ messages: previousMessages, message: userMessageForAppend });

    // 5. Prepare Orchestration Context
    edgeLogger.info('Preparing orchestration context...', { operationId, sessionId, agentId });
    const orchestrator = new AgentOrchestrator();
    // Call the new method
    const {
      targetModelId,
      contextMessages = [] // Default to empty array if none provided
    } = await orchestrator.prepareContext(userMessage.content, agentId as AgentType | undefined);

    // Determine effective agent ID
    const effectiveAgentId = (agentId || 'default') as AgentType;

    // Build the system prompt for the identified agent
    const agentConfig = getAgentConfig(effectiveAgentId);
    const finalSystemPrompt = agentConfig.systemPrompt;

    // Create the tool set for this agent based on its configuration
    const agentToolSet = createAgentToolSet(effectiveAgentId);

    edgeLogger.info('Orchestration context prepared with tools and prompt', {
      operationId,
      sessionId,
      targetModelId,
      effectiveAgentId,
      contextMsgCount: contextMessages.length,
      hasTools: !!agentToolSet && Object.keys(agentToolSet).length > 0
    });

    // Append context messages from orchestrator to the history if any
    const messagesForFinalStream = [...currentMessages, ...contextMessages];

    // 6. Generate & Stream Final Response using streamText
    const result = streamText({
      model: openai(targetModelId || 'gpt-4o-mini'), // Use model determined by orchestrator or fallback
      messages: messagesForFinalStream, // History + User Msg + Orchestrator Context Msgs
      system: finalSystemPrompt, // Use the agent-specific system prompt
      tools: agentToolSet, // Include the agent-specific tools
      experimental_generateMessageId: generateUUID,

      async onFinish({ response, usage, finishReason }) {
        const finishTime = Date.now();
        edgeLogger.info('Stream finished, processing persistence', {
          category: LOG_CATEGORIES.CHAT,
          operation: 'stream_onFinish',
          operationId,
          sessionId,
          durationMs: finishTime - startTime, // Log total duration here
          usage: usage,
          finishReason: finishReason,
        });
        try {
          const assistantMessages = response.messages;

          // We only expect one assistant message from streamText normally
          if (assistantMessages && assistantMessages.length > 0) {
            // Define the type explicitly to help inference
            const assistantMsgData: {
              sessionId: string;
              userId: string;
              role: 'assistant' | 'user' | 'system' | 'function' | 'tool';
              content: string | any; // Match service signature
              messageId?: string;
              tools_used?: ToolsUsedData | undefined; // Match service signature
            } = {
              sessionId,
              userId,
              role: assistantMessages[0].role,
              content: assistantMessages[0].content,
              messageId: assistantMessages[0].id, // ID generated by streamText
              // TODO: Extract actual tools_used if available from assistantMessages[0]
              tools_used: undefined
            };

            // Save user message FIRST (important for history order)
            const userSaveResult = await persistenceService.saveUserMessage(
              sessionId,
              userMessage.content,
              userId,
              userMessage.id // ID generated by useChat client
            );
            if (!userSaveResult.success) {
              edgeLogger.error('Failed to save user message in onFinish', { operationId, sessionId, error: userSaveResult.error });
              // Continue to save assistant message despite user save failure
            }

            // Save assistant message with CORRECT parameter order
            const assistantSaveResult = await persistenceService.saveAssistantMessage(
              assistantMsgData.sessionId,
              assistantMsgData.content,
              assistantMsgData.userId,
              undefined, // toolsUsed (TODO: Populate if needed)
              assistantMsgData.messageId // messageId is last
            );
            if (!assistantSaveResult.success) {
              edgeLogger.error('Failed to save assistant message in onFinish', { operationId, sessionId, error: assistantSaveResult.error });
              // Log error, but don't fail the response to the user
            }
          } else {
            edgeLogger.warn('No assistant messages found in streamText response for persistence', { operationId, sessionId });
          }

          edgeLogger.info('Persistence completed in onFinish', { operationId, sessionId });
          // TODO: Invalidate frontend history cache if necessary

        } catch (persistError) {
          edgeLogger.error('Persistence failed in onFinish', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            sessionId,
            error: persistError instanceof Error ? persistError.message : String(persistError),
            important: true
          });
          // Don't block response to user if persistence fails, but log it critically.
        }
      },
      // TODO: Add onError handler for streamText itself?
    });

    // 7. Return Streaming Response
    return result.toDataStreamResponse();

  } catch (error) {
    edgeLogger.error('Unhandled error in main chat API', {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_post_error',
      operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      important: true
    });
    // Use the standardized error response utility
    return errorResponse(
      'An unexpected error occurred processing your message',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
} 