/**
 * Widget Chat API Route
 * 
 * This route handler uses the unified chat engine to process widget chat requests.
 * It follows the refactoring plan by delegating core functionality to the chat engine
 * and only maintaining widget-specific configuration here.
 */

import { createChatEngine } from '@/lib/chat-engine/core';
import { widgetTools } from '@/lib/tools/registry.tool';
import { prompts } from '@/lib/chat-engine/prompts';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';

export const runtime = 'edge';
export const maxDuration = 30; // 30 seconds max duration for widget requests

// Constants
const defaultHeaders = { 'Content-Type': 'application/json' };

/**
 * Helper function to get allowed origins from environment variables
 */
function getAllowedOrigins(): string[] {
  return process.env.WIDGET_ALLOWED_ORIGINS
    ? process.env.WIDGET_ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'https://marlan.photographytoprofits.com', 'https://programs.thehighrollersclub.io'];
}

/**
 * Function to add CORS headers to a response
 */
function addCorsHeaders(response: Response, req: Request): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');

  const corsHeaders = new Headers(response.headers);

  if (isAllowedOrigin) {
    corsHeaders.set('Access-Control-Allow-Origin', origin);
  } else {
    corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }

  corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  corsHeaders.set('Access-Control-Max-Age', '86400');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders
  });
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: Request): Promise<Response> {
  const response = new Response(null, { status: 204 });
  return addCorsHeaders(response, req);
}

// Add GET method for wakeup ping
export async function GET(req: Request): Promise<Response> {
  // Check if this is a wakeup ping
  const isWakeupPing = req.headers.get('x-wakeup-ping') === 'true';

  if (isWakeupPing) {
    edgeLogger.info('Received wakeup ping', {
      timestamp: new Date().toISOString()
    });

    const response = successResponse({
      status: 'online',
      timestamp: new Date().toISOString()
    });

    return addCorsHeaders(response, req);
  }

  // Return a generic response for other GET requests
  return addCorsHeaders(
    errorResponse('Method not allowed', 'Use POST to interact with the widget', 405),
    req
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Create a configured chat engine instance for the widget chat
    const engine = createChatEngine({
      tools: widgetTools,
      requiresAuth: false,
      corsEnabled: true,
      systemPrompt: prompts.widget,
      maxTokens: 800,
      temperature: 0.4,
      useWebScraper: false,
      useDeepSearch: false,
      operationName: 'widget_chat',
      cacheEnabled: true,
      messageHistoryLimit: 20
    });

    // Let the engine handle the request
    const response = await engine.handleRequest(req);

    // Add CORS headers to the response
    return addCorsHeaders(response, req);
  } catch (error) {
    edgeLogger.error('Unhandled error in widget chat route', {
      error: error instanceof Error ? error.message : String(error)
    });

    // Return a friendly error message using a plain text response
    // Note: Using 200 here to allow the error to display properly in the widget
    const response = new Response(
      "I apologize, but I encountered an error processing your request. Please try again with a different question.",
      {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      }
    );

    return addCorsHeaders(response, req);
  }
} 