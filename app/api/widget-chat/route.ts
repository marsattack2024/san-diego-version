/**
 * Widget Chat API Route
 * 
 * This route handler uses the unified chat engine to process widget chat requests.
 * It follows the refactoring plan by delegating core functionality to the chat engine
 * and only maintaining widget-specific configuration here.
 */

import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { widgetTools } from '@/lib/tools/registry.tool';
import { prompts } from '@/lib/chat-engine/prompts';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError } from '@/lib/utils/route-handler';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { handleCors } from '@/lib/utils/http-utils';
import { z } from 'zod';

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
  const operationId = `widget_${Math.random().toString(36).substring(2, 8)}`;
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
  const operationId = `widget_${Math.random().toString(36).substring(2, 8)}`;

  try {
    // Clone the request for potential debugging and for passing to the engine
    const reqClone = req.clone();

    // Log all headers in development for debugging
    if (process.env.NODE_ENV === 'development') {
      const headers: Record<string, string> = {};
      reqClone.headers.forEach((value, key) => {
        headers[key] = value;
      });

      edgeLogger.debug('Widget chat: Request headers', {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'widget_chat',
        operationId,
        headers
      });
    }

    // Parse and validate the request body
    let body: any;
    try {
      body = await req.json();

      edgeLogger.debug('Widget chat: Request received', {
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

      // Update body with validated data
      body = result.data;
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

    // Create a configured chat engine instance for the widget chat
    const engine = createChatEngine({
      tools: widgetTools,
      requiresAuth: false,  // Explicitly disable auth requirement
      corsEnabled: true,
      systemPrompt: prompts.widget,
      maxTokens: 800,
      temperature: 0.4,
      model: 'gpt-4o-mini', // Use the smaller, faster model for the widget
      useWebScraper: false,
      useDeepSearch: false,
      operationName: `widget_chat_${operationId}`,
      cacheEnabled: true,
      messageHistoryLimit: 20,
      // Widget uses client-side storage for messages, disable server-side persistence
      messagePersistenceDisabled: true,
      body: {
        sessionId: body.sessionId,
        isWidgetChat: true, // Flag to identify widget chats
        bypassAuth: true    // Skip authentication checks for widget
      }
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
      status: response.status
    });

    // The engine's handleRequest already applies CORS via handleCors when corsEnabled is true
    return response;
  } catch (error) {
    edgeLogger.error('Unhandled error in widget chat route', {
      category: LOG_CATEGORIES.SYSTEM,
      operation: 'widget_chat',
      operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return a friendly error message that can be displayed to the user
    const errorResponse = new Response(
      JSON.stringify({
        error: true,
        message: "I apologize, but I encountered an error processing your request. Please try again.",
        success: false,
        id: crypto.randomUUID(), // Include message ID for consistency with AI SDK
        role: "assistant", // Match format expected by the widget
        content: "I apologize, but I encountered an error processing your request. Please try again.",
        createdAt: new Date().toISOString()
      }),
      {
        status: 200, // Use 200 here to allow the widget to display the error properly
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return handleCors(errorResponse, req, true);
  }
} 