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
// Removed withAuth import
import type { User } from '@supabase/supabase-js'; // Import User type
// Import necessary functions for direct title generation
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { shouldGenerateTitle } from '@/lib/chat/title-service'; // Import shouldGenerateTitle

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
    const finalSystemPrompt = agentConfig.systemPrompt;
    const agentToolSet = createAgentToolSet(effectiveAgentId);

    persistenceService.saveUserMessage(
      sessionId,
      userMessageFromClient.content!, // Assert non-null
      userId, // Ensure user.id is passed
      userMessageFromClient.id! // Assert non-null
    ).catch(/* ... */);

    const result = streamText({
      model: openai(targetModelId || 'gpt-4o'),
      messages: [...contextMessages, ...currentMessages],
      system: finalSystemPrompt,
      tools: agentToolSet,
      experimental_generateMessageId: generateUUID,

      async onFinish({ response, usage, finishReason, text }) {
        // ... (inside onFinish) ...
        const titleResult = await generateText({
          model: openai('gpt-3.5-turbo'),
          messages: [
            { role: 'system', content: 'Create a title that summarizes the main topic or intent of the user message in 2-6 words. Do not use quotes. Keep it concise and relevant.' },
            { role: 'user', content: String(userMessageFromClient!.content!).substring(0, 1000) } // Assert non-null on both
          ],
          maxTokens: 30,
          temperature: 0.6
        });
        // ... (rest of onFinish)
      },
    });

    return result.toDataStreamResponse();

  } catch (error) {
    // Top-level catch block for the direct export function
    edgeLogger.error('Unexpected error in POST chat handler', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
    // Use standard errorResponse + handleCors
    const errRes = errorResponse('Internal Server Error', error, 500);
    return handleCors(errRes, request, true); // Wrap the final catch block response
  }
}

// Removed export of POST_Handler 