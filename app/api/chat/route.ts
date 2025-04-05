/**
 * Main Chat API Route
 * 
 * This route handler uses the unified chat engine to process chat requests.
 * It handles agent selection, authentication, and delegates core functionality
 * to the chat engine components.
 */

// Vercel AI SDK Core
import { Message, streamText, appendClientMessage, appendResponseMessages, generateText, ToolCall, ToolResult, CoreMessage } from 'ai';
// Supabase & Auth
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { createRouteHandlerAdminClient } from '@/lib/supabase/route-client';
// Logging
import { edgeLogger, THRESHOLDS } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
// Remove titleLogger import if not used elsewhere or properly defined
// import { titleLogger } from '@/lib/logger/title-logger'; 
// Utilities & Route Handling
import { errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
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
import { buildSystemPromptWithDeepSearch } from '@/lib/chat-engine/prompts'; // Import the prompt builder
// Removed withAuth import
import type { User } from '@supabase/supabase-js'; // Import User type
// Import necessary functions for direct title generation
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { shouldGenerateTitle } from '@/lib/chat/title-service'; // Import shouldGenerateTitle
import { AIStreamService } from '@/lib/chat-engine/services/ai-stream.service'; // Import AIStreamService
import { ChatEngineContext } from '@/lib/chat-engine/types'; // Import ChatEngineContext
import { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config'; // Import ChatEngineConfig

// Define request schema for validation
// Updated to match experimental_prepareRequestBody in components/chat.tsx
// **NOT EXPORTED** - This should stay internal to the route handler
const ChatRequestSchema = z.object({
  id: z.string().uuid(), // Chat ID is required in this flow
  message: z.object({ // Expect a single message object
    id: z.string(),
    role: z.enum(['user']), // Should always be 'user' from client prepareRequestBody
    content: z.string(),
    createdAt: z.string().datetime().optional(),
    // Ensure all fields used later (like attachments if needed) are included or optional
    experimental_attachments: z.any().optional(), // Add if attachments are sent
    toolInvocations: z.any().optional(), // Add if tool invocations are relevant
    // Include other relevant fields from 'ai' Message type if necessary
  }).nullable(), // Allow null if messages array was empty client-side (edge case)
  deepSearchEnabled: z.boolean().optional(),
  agentId: z.string().optional()
});

// Infer the request body type from the schema
type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

// Maintain existing runtime directives
export const runtime = 'edge';
export const maxDuration = 120;
export const dynamic = 'force-dynamic'; // Ensure dynamic behavior

// Define the core handler logic separately (Pattern B - Direct Export)
// Removed AuthenticatedRouteHandler type annotation
export async function POST(request: Request) { // No context needed if no params
  const operationId = `chat_${Math.random().toString(36).substring(2, 10)}`;
  const startTime = Date.now();

  let user: User | null = null; // Declare user variable

  try {
    // 0. Manual Authentication
    const supabase = await createRouteHandlerClient();
    const { data: { user: authenticatedUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authenticatedUser) {
      edgeLogger.warn('Authentication required for POST chat', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        error: authError?.message || 'No authenticated user',
      });
      // Use standard unauthorizedError + handleCors
      const errRes = unauthorizedError('Authentication required');
      // NOTE: handleCors needs the original request. We don't have it easily here
      //       if not passed through. Consider adjusting handleCors or using standard Response.
      //       For now, returning raw Response for simplicity in this refactor.
      return new Response(JSON.stringify(errRes.body), { status: errRes.status });
    }
    user = authenticatedUser; // Assign authenticated user

    // 1. Validate Request Body
    let body: ChatRequestBody;
    try {
      const rawBody = await request.clone().text();
      edgeLogger.debug('Received raw request body', { operationId, rawBody });

      const validationResult = ChatRequestSchema.safeParse(await request.json());
      if (!validationResult.success) {
        edgeLogger.warn('Zod validation failed', { operationId, errors: validationResult.error.errors });
        throw validationResult.error;
      }
      body = validationResult.data;
      edgeLogger.debug('Validated request body', { operationId, body });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedError = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        edgeLogger.warn('Invalid request body (Zod)', { operationId, error: formattedError });
        const errRes = validationError('Invalid request body', formattedError);
        return handleCors(errRes, request, true);
      }
      edgeLogger.error('Error parsing request body', { operationId, error: error instanceof Error ? error.message : String(error) });
      const errRes = errorResponse('Error parsing request body', 'Could not parse request data', 400);
      return handleCors(errRes, request, true);
    }

    // ... (rest of the logic from original POST_Handler remains largely the same) ...
    // --- IMPORTANT: Replace all instances of `userId` derived from context with `user.id` ---
    const { message: userMessageFromClient, id: sessionId, agentId, deepSearchEnabled } = body;
    const userId = user.id; // Use manually authenticated user.id

    // Check if message is null and return early
    if (!userMessageFromClient) {
      edgeLogger.warn('Received null message from client', { operationId, sessionId });
      const errRes = errorResponse('Invalid request: No message provided', null, 400);
      return handleCors(errRes, request, true);
    }
    // Check role and return early
    if (userMessageFromClient.role !== 'user') {
      edgeLogger.warn('Received message with incorrect role', { operationId, sessionId, role: userMessageFromClient.role });
      const errRes = errorResponse('Invalid request: Message must be from user', null, 400);
      return handleCors(errRes, request, true);
    }

    // Now we know userMessageFromClient is not null
    const persistenceService = new MessagePersistenceService({ operationName: operationId });
    const previousMessages = await persistenceService.loadMessages(sessionId, userId);

    const createdAtDate = userMessageFromClient.createdAt ? new Date(userMessageFromClient.createdAt) : new Date();
    const userMessageForAppend: Message = {
      id: userMessageFromClient.id!,
      role: 'user',
      content: userMessageFromClient.content!,
      createdAt: createdAtDate,
      experimental_attachments: userMessageFromClient.experimental_attachments,
      toolInvocations: userMessageFromClient.toolInvocations,
    };
    const currentMessages = appendClientMessage({ messages: previousMessages, message: userMessageForAppend });

    const orchestrator = new AgentOrchestrator();
    const { targetModelId, contextMessages = [] } = await orchestrator.prepareContext(userMessageFromClient.content!, agentId as AgentType | undefined);
    const effectiveAgentId = (agentId || 'default') as AgentType;
    const agentConfig = getAgentConfig(effectiveAgentId);
    const finalSystemPrompt = buildSystemPromptWithDeepSearch(effectiveAgentId, deepSearchEnabled);
    const agentToolSet = createAgentToolSet(effectiveAgentId);

    // Log final messages, system prompt, and tools before streaming
    edgeLogger.debug('Preparing to call streamText', {
      operationId,
      sessionId,
      userId: user.id ? user.id.substring(0, 5) + '...' : 'unknown', // Mask userId
      targetModelId,
      contextMessageCount: contextMessages.length,
      historyMessageCount: previousMessages.length,
      systemPromptLength: finalSystemPrompt?.length || 0,
      toolCount: Object.keys(agentToolSet || {}).length,
      toolNames: Object.keys(agentToolSet || {})
    });

    persistenceService.saveUserMessage(
      sessionId,
      userMessageFromClient.content!, // Assert non-null
      userId, // Ensure user.id is passed
      userMessageFromClient.id! // Assert non-null
    ).catch(error => {
      // Log errors from async user message save
      edgeLogger.error('Async error saving user message', {
        operationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        important: true // Add important flag
      });
    });

    // Initialize collected tool calls array with generic types
    const collectedToolCalls: ToolCall<any, any>[] = [];

    // --- Prepare Arguments for AIStreamService ---
    const aiStreamService = new AIStreamService();

    // Combine messages for the service context
    const allMessagesForContext = [...contextMessages, ...currentMessages];

    // Prepare context object for the service
    const serviceContext: Partial<ChatEngineContext> = {
      requestId: operationId,
      sessionId,
      userId,
      startTime,
      messages: allMessagesForContext, // Pass combined messages
      previousMessages: previousMessages // Keep for title generation check in callback
    };

    // Prepare config object for the service
    const serviceConfig: ChatEngineConfig = {
      model: targetModelId || 'gpt-4o',
      systemPrompt: finalSystemPrompt,
      tools: agentToolSet,
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens || 4096, // Ensure default if not set
      // Pass the original request body for context injection (deepSearchEnabled, etc.)
      body: { ...body, userId },
      operationName: operationId,
      // Add other relevant config flags if needed by the service
      requiresAuth: false, // Auth already handled
      messagePersistenceDisabled: false // Assuming persistence handled via callback
    };

    // Define the onFinish callback function for the service
    const onFinishForService = async ({ text, toolCalls, usage, response }: {
      text: string;
      toolCalls?: ToolCall<any, any>[];
      usage: { completionTokens: number; promptTokens: number; totalTokens: number; };
      response?: any;
    }) => {
      edgeLogger.info('AIStreamService: onFinish callback started', {
        category: LOG_CATEGORIES.LLM,
        operationId,
        sessionId,
        finishReason: 'callback_invoked', // Indicate callback source
        textLength: text?.length || 0,
        usage,
        toolCallCount: toolCalls?.length || 0
      });

      // --- Format Tool Calls for Persistence ---
      let toolsUsedForPersistence: ToolsUsedData | undefined = undefined;
      if (toolCalls && toolCalls.length > 0) {
        toolsUsedForPersistence = {
          api_tool_calls: toolCalls.map(call => ({
            name: call.toolName,
            id: call.toolCallId, // Use toolCallId
            // Optionally include args if needed and safe: args: call.args,
            type: 'function' // Assuming Vercel SDK uses 'function' type
          }))
          // TODO: Add logic here if tools are also extracted from text content
        };
        edgeLogger.info('Formatted tool calls for persistence (in Service Callback)', {
          operationId,
          sessionId,
          toolCount: toolCalls.length,
          toolNames: toolCalls.map(c => c.toolName)
        });
      }
      // -------------------------------------------

      // Title Generation Logic (needs access to outer scope vars)
      let generatedTitle = 'New Chat';
      try {
        // Check if previousMessages exists in the outer scope
        if (await shouldGenerateTitle(sessionId, userId)) {
          const titleStartTime = Date.now();
          // Use CHAT category for title logs
          edgeLogger.info('Generating title (in Service Callback)', { category: LOG_CATEGORIES.CHAT, operationId, sessionId, inputLength: userMessageFromClient.content!.length });
          const titleResult = await generateText({
            model: openai('gpt-3.5-turbo'), // Use a faster model for titles
            messages: [
              { role: 'system', content: 'Create a title that summarizes the main topic or intent of the user message in 2-6 words. Do not use quotes. Keep it concise and relevant.' },
              { role: 'user', content: String(userMessageFromClient!.content!).substring(0, 1000) } // Assert non-null on both
            ],
            maxTokens: 30,
            temperature: 0.6
          });
          generatedTitle = cleanTitle(titleResult.text);
          // Use CHAT category for title logs
          edgeLogger.info('Title generated successfully (in Service Callback)', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            sessionId,
            title: generatedTitle,
            durationMs: Date.now() - titleStartTime
          });
        } else {
          edgeLogger.info('Skipping title generation (in Service Callback)', { category: LOG_CATEGORIES.CHAT, operationId, sessionId });
        }
      } catch (titleError) {
        edgeLogger.error('Error generating title (in Service Callback)', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          sessionId,
          error: titleError instanceof Error ? titleError.message : String(titleError)
        });
      }

      // Assistant Message Persistence Logic (needs access to outer scope vars)
      try {
        const persistenceStartTime = Date.now();
        const assistantContent = text || '';
        await persistenceService.saveAssistantMessage(
          sessionId,
          assistantContent,
          userId,
          toolsUsedForPersistence
        );
        edgeLogger.info('Assistant message saved successfully (in Service Callback)', {
          operationId,
          sessionId,
          durationMs: Date.now() - persistenceStartTime,
          contentLength: assistantContent.length
        });
      } catch (persistenceError) {
        edgeLogger.error('Error saving assistant message (in Service Callback)', {
          operationId,
          sessionId,
          error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
          important: true // Add important flag
        });
      }

      // Update Title in DB Logic (needs access to outer scope vars)
      try {
        if (generatedTitle !== 'New Chat') {
          const updateStartTime = Date.now();
          await updateTitleInDatabase(supabase, sessionId, generatedTitle, userId);
          edgeLogger.info('Title updated in database (in Service Callback)', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            sessionId,
            title: generatedTitle,
            durationMs: Date.now() - updateStartTime
          });
        }
      } catch (updateError) {
        edgeLogger.error('Error updating title in database (in Service Callback)', {
          category: LOG_CATEGORIES.CHAT,
          operationId,
          sessionId,
          title: generatedTitle,
          error: updateError instanceof Error ? updateError.message : String(updateError),
          important: true // Add important flag
        });
      }

      edgeLogger.info('AIStreamService: onFinish callback completed', {
        category: LOG_CATEGORIES.LLM,
        operationId,
        sessionId
      });
    };

    // --- Call AIStreamService --- 
    edgeLogger.debug('Calling AIStreamService process', { operationId, sessionId });
    const streamResponse = await aiStreamService.process(
      serviceContext as ChatEngineContext, // Cast needed if using partial context
      serviceConfig as ChatEngineConfig, // Cast needed if using partial config
      { onStreamFinish: onFinishForService }
    );
    edgeLogger.debug('AIStreamService process returned', { operationId, sessionId });

    // Log total request duration before returning
    const totalDurationMs = Date.now() - startTime;
    const isTotalSlow = totalDurationMs > THRESHOLDS.SLOW_OPERATION;
    const isTotalImportant = totalDurationMs > THRESHOLDS.IMPORTANT_THRESHOLD;
    // Use specific logger level method
    (isTotalSlow ? edgeLogger.warn : edgeLogger.info).call(edgeLogger, 'API request completed successfully', {
      category: LOG_CATEGORIES.CHAT, // Or SYSTEM?
      operationId,
      sessionId,
      method: request.method,
      path: new URL(request.url).pathname,
      status: 200, // Assuming success if we reach here
      durationMs: totalDurationMs,
      slow: isTotalSlow,
      important: isTotalImportant
    });

    // Return the response from the service
    return streamResponse;

  } catch (error) {
    // --- Top Level Error Handling --- 
    const totalDurationMs = Date.now() - startTime; // Calculate duration even on error
    edgeLogger.error('Unexpected error in POST chat handler', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: totalDurationMs, // Log duration on error
      important: true
    });
    const errRes = errorResponse('Internal Server Error', error, 500);
    return handleCors(errRes, request, true);
  }
}

// Removed export of POST_Handler 