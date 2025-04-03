/**
 * Main Chat API Route
 * 
 * This route handler uses the unified chat engine to process chat requests.
 * It handles agent selection, authentication, and delegates core functionality
 * to the chat engine components.
 */

import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { errorResponse, unauthorizedError, validationError, successResponse } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { OrchestratedResponse } from '@/lib/chat-engine/types/orchestrator';
import { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';

// Maintain existing runtime directives
export const runtime = 'edge';
export const maxDuration = 120;
export const dynamic = 'force-dynamic'; // Ensure dynamic behavior

/**
 * POST handler for the chat route
 * Handles creation of new chat messages and streaming responses
 */
export async function POST(request: Request): Promise<Response> {
  const operationId = `chat_${Math.random().toString(36).substring(2, 10)}`;
  const startTime = Date.now();

  edgeLogger.info('Chat POST request received', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'chat_post',
    operationId
  });

  let body: Record<string, any>;
  let reqClone: Request;

  try {
    reqClone = request.clone(); // Clone request early for potential use in error logging
    body = await request.json();

    edgeLogger.debug('Parsed request body', {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_post',
      operationId,
      bodyKeys: Object.keys(body)
    });

    // --- Basic Validation --- 
    const sessionId = body.id;
    if (!sessionId) {
      edgeLogger.warn('Validation Error: Missing session ID', { category: LOG_CATEGORIES.CHAT, operationId });
      return validationError('Session ID (id) is required');
    }
    if (!body.messages && !body.message) {
      edgeLogger.warn('Validation Error: Missing message(s)', { category: LOG_CATEGORIES.CHAT, operationId, sessionId });
      return validationError('Either message or messages field is required');
    }
    // Consider adding Zod validation here later for stricter schema checking

    // --- Authentication --- 
    // TODO: Add BYPASS_AUTH check here if still needed for development
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      edgeLogger.warn('Authentication failed for chat request', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        sessionId,
        error: authError?.message || 'No user found'
      });
      return unauthorizedError('Authentication required');
    }
    const userId = user.id;
    // Assuming persistenceUserId is the same as authenticated userId for main chat
    const persistenceUserId = userId;

    edgeLogger.info('User authenticated', {
      category: LOG_CATEGORIES.AUTH,
      operationId,
      sessionId,
      userId: userId.substring(0, 8) // Log partial ID
    });

    // --- Configuration Setup --- 
    const chatSetupService = new ChatSetupService();
    // Result can be either standard config or orchestrated result
    const engineSetupResult = await chatSetupService.prepareConfig({
      requestBody: body,
      userId: persistenceUserId,
      isWidget: false // This is the main chat route
    });

    // --- Check if Orchestration Occurred --- 
    if ('type' in engineSetupResult && engineSetupResult.type === 'orchestrated') {
      // Handle Orchestrated Result
      const orchestratedData = (engineSetupResult as OrchestratedResponse).data;

      edgeLogger.info('Orchestration completed, returning JSON response', {
        category: LOG_CATEGORIES.ORCHESTRATOR,
        operationId,
        sessionId,
        status: 200,
        durationMs: Date.now() - startTime
      });

      // TODO: Consider persistence needs for orchestrated flows
      // Maybe save the final result or key steps to the database?

      // Use successResponse utility for consistent JSON formatting
      return successResponse(orchestratedData);
    } else {
      // --- Handle Single Agent Flow (Existing Logic) --- 
      const engineConfig = engineSetupResult as ChatEngineConfig;
      const engine = createChatEngine(engineConfig);

      edgeLogger.info('Single-agent engine created, handling request...', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        sessionId,
        agentType: engineConfig.agentType,
        useDeepSearch: engineConfig.useDeepSearch,
        toolCount: Object.keys(engineConfig.tools || {}).length
      });

      // Pass the cloned request with the already parsed body
      const response = await engine.handleRequest(reqClone, { parsedBody: body });

      // --- Stream Consumption (Existing Logic) ---
      if (response.body && 'consumeStream' in (response as any)) {
        (response as any).consumeStream().catch((streamError: any) => {
          edgeLogger.error('Error consuming response stream post-response', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            sessionId,
            error: streamError instanceof Error ? streamError.message : String(streamError)
          });
        });
        edgeLogger.info('Response stream consumption initiated', { category: LOG_CATEGORIES.CHAT, operationId, sessionId });
      } else {
        edgeLogger.warn('Response body does not support consumeStream', { category: LOG_CATEGORIES.CHAT, operationId, sessionId });
      }

      edgeLogger.info('Single-agent request processed successfully', {
        category: LOG_CATEGORIES.CHAT,
        operationId,
        sessionId,
        status: response.status,
        durationMs: Date.now() - startTime
      });

      return response;
    }

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