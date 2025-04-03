/**
 * Widget Chat API Route
 * 
 * This route handler uses the unified chat engine to process widget chat requests.
 * It follows the refactoring plan by delegating core functionality to the chat engine
 * and only maintaining widget-specific configuration here.
 */

import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError } from '@/lib/utils/route-handler';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { handleCors } from '@/lib/utils/http-utils';
import { z } from 'zod';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';

export const runtime = 'edge';
export const maxDuration = 30; // 30 seconds max duration for widget requests

// Define request schema for validation
const widgetRequestSchema = z.object({
  message: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool', 'function']),
    content: z.string().or(z.record(z.any())).or(z.null()),
    id: z.string().optional()
  })).optional(),
  sessionId: z.string().uuid()
}).refine(data =>
  (!!data.message || (Array.isArray(data.messages) && data.messages.length > 0)),
  { message: "Either message or messages must be provided" }
);

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: Request): Promise<Response> {
  const response = new Response(null, { status: 204 });
  return handleCors(response, req, true);
}

// Add GET method for wakeup ping and health check
export async function GET(req: Request): Promise<Response> {
  const operationId = `widget_get_${Math.random().toString(36).substring(2, 8)}`;
  const url = new URL(req.url);
  const isWakeupPing = req.headers.get('x-wakeup-ping') === 'true' || url.searchParams.get('ping') === 'true';

  if (isWakeupPing) {
    edgeLogger.info('Widget chat: Received wakeup ping', {
      category: LOG_CATEGORIES.SYSTEM,
      operation: 'widget_ping',
      operationId
    });

    const response = successResponse({
      status: 'online',
      timestamp: new Date().toISOString()
    });

    return handleCors(response, req, true);
  }

  // Return a generic response for other GET requests
  return handleCors(
    errorResponse('Method not allowed', 'Use POST to interact with the widget', 405),
    req,
    true
  );
}

export async function POST(req: Request): Promise<Response> {
  const operationId = `widget_post_${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();

  let body: Record<string, any>;
  let reqClone: Request;

  try {
    reqClone = req.clone(); // Clone request early

    // Log headers in development
    if (process.env.NODE_ENV === 'development') {
      const headers: Record<string, string> = {};
      reqClone.headers.forEach((value, key) => { headers[key] = value; });
      edgeLogger.debug('Widget chat: Request headers', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'widget_chat',
        operationId,
        headers
      });
    }

    // --- Validation --- 
    try {
      body = await req.json();
      edgeLogger.debug('Widget chat: Parsed request body', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'widget_chat',
        operationId,
        body: {
          hasMessage: !!body.message,
          hasMessages: Array.isArray(body.messages),
          sessionId: body.sessionId || 'not_provided',
          messageCount: Array.isArray(body.messages) ? body.messages.length : 0
        }
      });

      // Validate with Zod schema
      const result = widgetRequestSchema.safeParse(body);
      if (!result.success) {
        edgeLogger.warn('Widget chat: Invalid request body', {
          category: LOG_CATEGORIES.SYSTEM,
          operation: 'widget_chat',
          operationId,
          errors: result.error.format()
        });
        return handleCors(
          validationError('Invalid request body', result.error.format()),
          req,
          true
        );
      }
      body = result.data; // Use validated data
    } catch (parseError) {
      edgeLogger.error('Widget chat: Failed to parse request body', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'widget_chat',
        operationId,
        error: parseError instanceof Error ? parseError.message : String(parseError)
      });
      return handleCors(
        errorResponse('Invalid JSON', 'Failed to parse request body', 400),
        req,
        true
      );
    }

    // --- Configuration Setup --- 
    const chatSetupService = new ChatSetupService();
    const engineSetupResult = await chatSetupService.prepareConfig({
      requestBody: body,
      userId: undefined, // Widget is unauthenticated
      isWidget: true
    });

    // --- Type Check & Engine Creation --- 
    // Ensure we didn't accidentally get an orchestrated response for a widget
    if ('type' in engineSetupResult && engineSetupResult.type === 'orchestrated') {
      edgeLogger.error('Orchestration response received for widget chat, which is not supported.', {
        category: LOG_CATEGORIES.SYSTEM,
        operationId,
        sessionId: body.sessionId,
        important: true
      });
      // Return an error - internal server error because this shouldn't happen
      return handleCors(
        errorResponse('Internal configuration error', 'Widget cannot use orchestration', 500),
        req,
        true
      );
    }

    // We know it's a standard config now, cast it
    const engineConfig = engineSetupResult as ChatEngineConfig;
    const engine = createChatEngine(engineConfig);

    edgeLogger.info('Widget chat engine created, handling request...', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      sessionId: body.sessionId?.substring(0, 8),
      agentType: engineConfig.agentType,
      toolCount: Object.keys(engineConfig.tools || {}).length
    });

    // Pass the cloned request with pre-parsed body to the engine
    const response = await engine.handleRequest(reqClone, {
      parsedBody: body,
      additionalContext: {
        isWidgetRequest: true,
        operationId
      }
    });

    edgeLogger.debug('Widget chat: Response sent', {
      category: LOG_CATEGORIES.SYSTEM,
      operation: 'widget_chat',
      operationId,
      sessionId: body.sessionId,
      status: response.status,
      durationMs: Date.now() - startTime
    });

    // CORS is handled within engine.handleRequest as config.corsEnabled is true
    return response;

  } catch (error) {
    edgeLogger.error('Unhandled error in widget chat route', {
      category: LOG_CATEGORIES.SYSTEM,
      operation: 'widget_chat_error',
      operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      important: true
    });

    // Return a friendly error message formatted for the widget UI
    const errorPayload = {
      error: true,
      message: "I apologize, but I encountered an error processing your request. Please try again.",
      success: false,
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: "I apologize, but I encountered an error processing your request. Please try again.",
      createdAt: new Date().toISOString()
    };

    const errorResponse = new Response(JSON.stringify(errorPayload), {
      status: 200, // Use 200 for widget error display
      headers: { 'Content-Type': 'application/json' }
    });

    return handleCors(errorResponse, req, true);
  }
} 