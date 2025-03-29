/**
 * Widget Chat API Route
 * 
 * This route handler uses the unified chat engine to process widget chat requests.
 * It follows the refactoring plan by delegating core functionality to the chat engine
 * and only maintaining widget-specific configuration here.
 */

import { createChatEngine } from '@/lib/chat-engine/core';
import { widgetTools } from '@/lib/chat-engine/tools/registry';
import { prompts } from '@/lib/chat-engine/prompts';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { NextRequest } from 'next/server';

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
function addCorsHeaders(response: Response, req: NextRequest): Response {
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
export async function OPTIONS(req: NextRequest) {
  const response = new Response(null, { status: 204 });
  return addCorsHeaders(response, req);
}

// Add GET method for wakeup ping
export async function GET(req: NextRequest) {
  // Check if this is a wakeup ping
  const isWakeupPing = req.headers.get('x-wakeup-ping') === 'true';

  if (isWakeupPing) {
    edgeLogger.info('Received wakeup ping', {
      timestamp: new Date().toISOString()
    });

    return addCorsHeaders(
      new Response(
        JSON.stringify({ status: 'online', timestamp: new Date().toISOString() }),
        { status: 200, headers: defaultHeaders }
      ),
      req
    );
  }

  // Return a generic response for other GET requests
  return addCorsHeaders(
    new Response(
      JSON.stringify({ error: 'Method not allowed', message: 'Use POST to interact with the widget' }),
      { status: 405, headers: defaultHeaders }
    ),
    req
  );
}

export async function POST(req: NextRequest) {
  try {
    // Create a configured chat engine instance for the widget chat
    const engine = createChatEngine({
      tools: widgetTools,
      requiresAuth: false,
      corsEnabled: true,
      systemPrompt: prompts.widget,
      maxTokens: 800,
      temperature: 0.5,
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

    // Return a friendly error message
    return addCorsHeaders(
      new Response(
        "I apologize, but I encountered an error processing your request. Please try again with a different question.",
        {
          status: 200, // Use 200 to allow the error to display in the widget
          headers: {
            'Content-Type': 'text/plain'
          }
        }
      ),
      req
    );
  }
} 