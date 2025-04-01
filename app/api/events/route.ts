import { edgeLogger } from '@/lib/logger/edge-logger';
import {
  sendEventToClients,
  addEventClient,
  removeEventClient,
  getClientCount
} from '@/lib/api/events-manager';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

export const runtime = 'edge';

// Connect to the event stream
export async function GET(req: Request): Promise<Response> {
  // Extract query parameters
  const url = new URL(req.url);
  const authToken = url.searchParams.get('auth');
  const connectionId = Math.random().toString(36).substring(2, 10);

  // TEMPORARY FIX: In development, use a stub response to avoid authentication issues and UI freezing
  if (process.env.NODE_ENV === 'development') {
    edgeLogger.info('Using stubbed SSE response for events in development mode', {
      connectionId
    });

    // Create a simple ReadableStream that just sends ping events
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        const connectionEvent = `data: {"type":"connected","connectionId":"${connectionId}","userId":"development-mode"}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectionEvent));

        // Send a ping event every 30 seconds to keep the connection alive
        const pingInterval = setInterval(() => {
          try {
            const pingData = `data: {"type":"ping"}\n\n`;
            controller.enqueue(new TextEncoder().encode(pingData));
          } catch (err: unknown) {
            // If there's an error, the client is probably disconnected
            clearInterval(pingInterval);
            edgeLogger.info('Client disconnected during ping', {
              connectionId,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }, 30000);

        // Handle cleanup when the connection is closed
        req.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
          edgeLogger.info('Client disconnected', {
            connectionId
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
  }

  // PRODUCTION CODE BELOW - Only used in production environment
  try {
    // Create a Supabase client (different auth approaches)
    let userId: string;

    // 1. First try cookie-based auth (our preferred standard approach)
    try {
      const supabase = await createRouteHandlerClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (user && !error) {
        userId = user.id;

        edgeLogger.info('New cookie-authenticated event stream connection', {
          connectionId,
          userId: userId.substring(0, 8) + '...',
          authMethod: 'cookie'
        });
      } else if (!authToken) {
        // No auth token provided and cookie auth failed
        edgeLogger.warn('Unauthorized events connection attempt', {
          noToken: true,
          cookieAuthFailed: true
        });
        return unauthorizedError('Authentication required');
      } else {
        // Cookie auth failed but we have a token to try next
        throw new Error('Cookie auth failed, trying token auth');
      }
    } catch (cookieError) {
      // 2. Fall back to token-based auth (for compatibility)
      if (!authToken) {
        edgeLogger.warn('Unauthorized events connection attempt', {
          noToken: true,
          cookieError: cookieError instanceof Error ? cookieError.message : String(cookieError)
        });
        return unauthorizedError('No authentication token provided');
      }

      // Create a Supabase client with the provided token
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return [];
            },
            setAll() {
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
        return unauthorizedError('Invalid authentication token');
      }

      userId = data.user.id;

      edgeLogger.info('New token-authenticated event stream connection', {
        connectionId,
        userId: userId.substring(0, 8) + '...',
        authMethod: 'token'
      });
    }

    // Performance optimization: Set a maximum client limit to prevent memory issues
    if (getClientCount() >= 100) {
      edgeLogger.warn('Too many event stream connections', { connectionCount: getClientCount() });
      return errorResponse('Too many connections', { connectionCount: getClientCount() }, 503);
    }

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
    return errorResponse('Internal Server Error', err, 500);
  }
}

// POST handler to trigger events from other parts of the application
export async function POST(req: Request): Promise<Response> {
  // TEMPORARY FIX: In development, accept all event posts without authentication
  if (process.env.NODE_ENV === 'development') {
    try {
      const { type, status, details } = await req.json();

      if (!type || !status) {
        return errorResponse('Type and status are required', null, 400);
      }

      // Send the event to all connected clients
      sendEventToClients({ type, status, details });

      return successResponse({ success: true });
    } catch (err) {
      edgeLogger.error('Error processing event POST in development mode', {
        error: err instanceof Error ? err.message : String(err)
      });
      return errorResponse('Error processing request', err, 500);
    }
  }

  // PRODUCTION CODE BELOW
  try {
    // First authenticate the request
    try {
      const supabase = await createRouteHandlerClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (!user || error) {
        return unauthorizedError('Not authenticated');
      }
    } catch (authError) {
      edgeLogger.error('Auth error in events POST', {
        error: authError instanceof Error ? authError.message : String(authError)
      });
      return unauthorizedError('Authentication error');
    }

    const { type, status, details } = await req.json();

    if (!type || !status) {
      return errorResponse('Type and status are required', null, 400);
    }

    // Send the event to all connected clients
    sendEventToClients({ type, status, details });

    return successResponse({ success: true });
  } catch (err) {
    edgeLogger.error('Error processing event POST', {
      error: err instanceof Error ? err.message : String(err)
    });

    return errorResponse('Error processing request', err, 500);
  }
}