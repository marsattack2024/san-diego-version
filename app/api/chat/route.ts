/**
 * Main Chat API Route
 * 
 * This route handler uses the unified chat engine to process chat requests.
 * It handles agent selection, authentication, and delegates core functionality
 * to the chat engine components.
 */

import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { createToolSet } from '@/lib/tools/registry.tool';
import { detectAgentType } from '@/lib/chat-engine/agent-router';
import type { AgentType } from '@/types/core/agent';
import { prompts } from '@/lib/chat-engine/prompts';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
// Import config from its dedicated file
import { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';

// Maintain existing runtime directives
export const runtime = 'edge';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Helper to safely convert various representations of boolean values
 * Handles true/false, "true"/"false", 1/0, "1"/"0" and similar variations
 */
function parseBooleanValue(value: any): boolean {
  // Handle direct boolean values
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle string representations ("true", "false", "1", "0")
  if (typeof value === 'string') {
    const lowercaseValue = value.toLowerCase().trim();
    return lowercaseValue === 'true' || lowercaseValue === '1' || lowercaseValue === 'yes';
  }

  // Handle numeric values (1, 0)
  if (typeof value === 'number') {
    return value === 1;
  }

  // Default to false for null, undefined, or any other type
  return false;
}

/**
 * POST handler for the chat route
 * Handles creation of new chat messages and streaming responses
 */
export async function POST(request: Request): Promise<Response> {
  const operationId = `chat_${Math.random().toString(36).substring(2, 10)}`;

  edgeLogger.debug('Chat POST request received', {
    category: LOG_CATEGORIES.CHAT,
    operation: 'chat_post',
    operationId
  });

  try {
    // Use the ChatEngine facade to handle the request
    const chatEngine = createChatEngine({
      operationName: 'chat_default',
      corsEnabled: false,
      requiresAuth: true
    });
    return await chatEngine.handleRequest(request);
  } catch (error) {
    edgeLogger.error('Unexpected error in chat API', {
      category: LOG_CATEGORIES.CHAT,
      operation: 'chat_post_error',
      operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      important: true
    });

    return new Response(
      JSON.stringify({
        error: 'An unexpected error occurred processing your message',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
} 