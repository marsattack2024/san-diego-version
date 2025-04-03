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

  try {
    // Keep request cloning and parsing
    const reqClone = request.clone();
    body = await request.json();

    edgeLogger.debug('Parsed request body', {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_post',
      operationId,
      bodyKeys: Object.keys(body)
    });

    // --- Basic Validation (Keep) --- 
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

    // --- Authentication (Keep) --- 
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
    const persistenceUserId = user.id;
    edgeLogger.info('User authenticated', {
      category: LOG_CATEGORIES.AUTH,
      operationId,
      sessionId,
      userId: persistenceUserId.substring(0, 8) // Log partial ID
    });

    // --- Configuration Setup & Orchestration --- 
    const chatSetupService = new ChatSetupService();

    // Call prepareConfig - it will handle calling the orchestrator for this route
    // We expect an OrchestratedResponse here
    const setupResult = await chatSetupService.prepareConfig({
      requestBody: body,
      userId: persistenceUserId,
      isWidget: false // Explicitly false for this route
    });

    // --- Handle Orchestrated Result --- 
    // Type check to be safe, although we expect OrchestratedResponse
    if ('type' in setupResult && setupResult.type === 'orchestrated') {
      const orchestratedData = setupResult.data;
      edgeLogger.info('Orchestration completed, returning JSON response', {
        category: LOG_CATEGORIES.ORCHESTRATOR,
        operationId,
        sessionId,
        status: 200,
        durationMs: Date.now() - startTime
      });
      // TODO: Persistence for orchestrated flows?
      return successResponse(orchestratedData);
    } else {
      // This case should theoretically not happen for /api/chat anymore
      edgeLogger.error('Unexpected response type from ChatSetupService for main chat route.', {
        category: LOG_CATEGORIES.SYSTEM,
        operationId,
        sessionId,
        responseType: typeof setupResult,
        important: true,
      });
      return errorResponse('Internal server error: Invalid setup configuration.', 'Unexpected setup result', 500);
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
    return errorResponse(
      'An unexpected error occurred processing your message',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
} 