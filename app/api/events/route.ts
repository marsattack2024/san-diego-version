import { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import {
  sendEventToClients,
  addEventClient,
  removeEventClient,
  getClientCount
} from '@/lib/api/events-manager';
import { createServerClient } from '@supabase/ssr';

// Remove edge runtime - endpoint will use serverless runtime by default

// Connect to the event stream
export async function GET(req: NextRequest) {
  // 1. Extract auth token from query parameters
  const url = new URL(req.url);
  const authToken = url.searchParams.get('auth');

  // 2. Authentication check
  if (!authToken) {
    edgeLogger.warn('Unauthorized events connection attempt', { noToken: true });
    return new Response('Unauthorized - No authentication token provided', { status: 401 });
  }

  // 3. Validate token with Supabase
  try {
    // Create a Supabase client with the provided token
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return [];
          },
          setAll(cookiesToSet) {
            // No-op since we're using token auth
          }
        },
        global: {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      }
    );

    // Verify token by getting user info
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      edgeLogger.warn('Invalid token for events connection', {
        error: error?.message || 'No user found',
      });
      return new Response('Unauthorized - Invalid authentication token', { status: 401 });
    }

    // Valid user, proceed with connection
    const userId = data.user.id;

    // Performance optimization: Set a maximum client limit to prevent memory issues
    if (getClientCount() >= 100) {
      edgeLogger.warn('Too many event stream connections', { connectionCount: getClientCount() });
      return new Response('Too many connections', { status: 503 });
    }

    // Log connection for debugging
    const connectionId = Math.random().toString(36).substring(2, 10);
    edgeLogger.info('New authenticated event stream connection', {
      connectionId,
      userId: userId.substring(0, 8) + '...'
    });

    // Create a new readable stream
    const stream = new ReadableStream({
      start(controller) {
        // Store the controller for later use with user context
        addEventClient(controller, userId);

        // Send initial connection event
        const connectionEvent = `data: {"type":"connected","connectionId":"${connectionId}","userId":"${userId.substring(0, 8)}..."}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectionEvent));

        // Send a ping event every 30 seconds to keep the connection alive
        const pingInterval = setInterval(() => {
          try {
            const pingData = `data: {"type":"ping"}\n\n`;
            controller.enqueue(new TextEncoder().encode(pingData));
          } catch (err: unknown) {
            // If there's an error, the client is probably disconnected
            clearInterval(pingInterval);
            removeEventClient(controller);
            edgeLogger.info('Client disconnected during ping', {
              connectionId,
              userId: userId.substring(0, 8) + '...',
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }, 30000);

        // Handle cleanup when the connection is closed
        req.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
          removeEventClient(controller);
          edgeLogger.info('Client disconnected', {
            connectionId,
            userId: userId.substring(0, 8) + '...'
          });
        });
      }
    });

    // Return the stream with appropriate headers for SSE
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    // Handle unexpected errors
    edgeLogger.error('Error in events endpoint', {
      error: err instanceof Error ? err.message : String(err)
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}

// POST handler to trigger events from other parts of the application
export async function POST(req: NextRequest) {
  try {
    const { type, status, details } = await req.json();

    if (!type || !status) {
      return new Response(JSON.stringify({ error: 'Type and status are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send the event to all connected clients
    sendEventToClients({ type, status, details });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    edgeLogger.error('Error processing event POST', {
      error: err instanceof Error ? err.message : String(err)
    });

    return new Response(JSON.stringify({ error: 'Error processing request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}