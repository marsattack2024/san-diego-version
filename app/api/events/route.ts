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
import { NextResponse } from 'next/server';
import { handleCors } from '@/lib/utils/http-utils';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const clients = new Set<Client>();
const MAX_CONNECTIONS = 100;

interface Client {
  id: string;
  responseController: ReadableStreamDefaultController<any>;
  userId: string;
  lastPong: number;
  isAdmin?: boolean;
}

function addClient(client: Client): boolean {
  if (clients.size >= MAX_CONNECTIONS) {
    edgeLogger.warn('Max SSE connections reached', {
      category: LOG_CATEGORIES.SYSTEM,
      currentCount: clients.size,
      maxCount: MAX_CONNECTIONS
    });
    return false;
  }
  clients.add(client);
  edgeLogger.info('SSE client connected', {
    category: LOG_CATEGORIES.SYSTEM,
    clientId: client.id,
    userId: client.userId ? client.userId.substring(0, 8) + '...' : 'anon',
    currentCount: clients.size
  });
  return true;
}

function removeClient(clientId: string): void {
  let removed = false;
  clients.forEach(client => {
    if (client.id === clientId) {
      clients.delete(client);
      removed = true;
      edgeLogger.info('SSE client disconnected', {
        category: LOG_CATEGORIES.SYSTEM,
        clientId: client.id,
        userId: client.userId ? client.userId.substring(0, 8) + '...' : 'anon',
        currentCount: clients.size
      });
    }
  });
  if (!removed) {
    edgeLogger.warn('Attempted to remove non-existent SSE client', { category: LOG_CATEGORIES.SYSTEM, clientId });
  }
}

function broadcast(message: any, targetUserId?: string | null, requireAdmin?: boolean): void {
  const messageString = `data: ${JSON.stringify(message)}\n\n`;
  clients.forEach(client => {
    if (targetUserId && client.userId === targetUserId) {
      if (!requireAdmin || client.isAdmin) {
        client.responseController.enqueue(new TextEncoder().encode(messageString));
      }
    }
    else if (!targetUserId && requireAdmin && client.isAdmin) {
      client.responseController.enqueue(new TextEncoder().encode(messageString));
    }
    else if (!targetUserId && !requireAdmin) {
      client.responseController.enqueue(new TextEncoder().encode(messageString));
    }
  });
}

setInterval(() => {
  const now = Date.now();
  clients.forEach(client => {
    if (now - client.lastPong > 60000) {
      edgeLogger.warn('SSE client appears stale, removing', {
        category: LOG_CATEGORIES.SYSTEM,
        clientId: client.id,
        userId: client.userId ? client.userId.substring(0, 8) + '...' : 'anon',
        lastPongDelta: now - client.lastPong
      });
      client.responseController.close();
      removeClient(client.id);
    } else {
      const pingMessage = `event: ping\ndata: ${JSON.stringify({ timestamp: now })}\n\n`;
      client.responseController.enqueue(new TextEncoder().encode(pingMessage));
    }
  });
}, 25000);

export async function GET(request: Request): Promise<Response> {
  const operationId = `sse_connect_${crypto.randomUUID().substring(0, 8)}`;
  let currentUserId: string | null = null;
  let isAdminUser = false;

  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      edgeLogger.error('SSE Auth Error', { operationId, error: authError.message });
    } else if (user) {
      currentUserId = user.id;
      isAdminUser = user.app_metadata?.is_admin === true;
      edgeLogger.info('SSE Auth Success', { operationId, userId: currentUserId.substring(0, 8) + '...', isAdmin: isAdminUser });
    } else {
      edgeLogger.info('SSE No User Session', { operationId });
    }

    const stream = new ReadableStream({
      start(controller) {
        const clientId = crypto.randomUUID();
        const client: Client = {
          id: clientId,
          responseController: controller,
          userId: currentUserId || 'anonymous',
          lastPong: Date.now(),
          isAdmin: isAdminUser
        };

        if (!addClient(client)) {
          const errRes = errorResponse('Too many connections', { connectionCount: getClientCount() }, 503);
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errRes.body)}\n\n`));
          controller.close();
          return;
        }

        const connectMsg = { type: 'connected', clientId: clientId, userId: client.userId, isAdmin: client.isAdmin };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(connectMsg)}\n\n`));
      },
      cancel(reason) {
        edgeLogger.warn('SSE stream cancelled (might be client closing connection)', {
          operationId: `sse_cancel_${crypto.randomUUID().substring(0, 8)}`,
          reason: reason ? (reason instanceof Error ? reason.message : String(reason)) : 'No reason provided'
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Supabase-Auth'
      }
    });

  } catch (err) {
    edgeLogger.error('Error establishing SSE connection', { operationId, error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const operationId = `sse_broadcast_${crypto.randomUUID().substring(0, 8)}`;
  try {
    let isAuthorized = false;
    const internalSecret = request.headers.get('X-Internal-Secret');
    if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
      isAuthorized = true;
      edgeLogger.debug('SSE Broadcast authorized via Internal Secret', { operationId });
    } else {
      try {
        const supabase = await createRouteHandlerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.app_metadata?.is_admin === true) {
          isAuthorized = true;
          edgeLogger.debug('SSE Broadcast authorized via Admin Cookie', { operationId, userId: user.id });
        }
      } catch (authError) {
        edgeLogger.warn('SSE Broadcast cookie auth check failed', { operationId, error: authError instanceof Error ? authError.message : String(authError) });
      }
    }

    if (!isAuthorized) {
      edgeLogger.warn('Unauthorized SSE broadcast attempt', { operationId });
      const errRes = unauthorizedError('Not authorized to broadcast events');
      return handleCors(errRes, request, true);
    }

    const { type, payload, targetUserId, targetAdminOnly } = await request.json();

    if (!type || !payload) {
      const errRes = errorResponse('Type and payload are required', null, 400);
      return handleCors(errRes, request, true);
    }

    edgeLogger.info('Broadcasting SSE event', {
      operationId,
      type,
      targetUserId,
      targetAdminOnly,
      clientCount: getClientCount()
    });

    broadcast({ type, ...payload }, targetUserId, targetAdminOnly);

    const response = successResponse({ success: true });
    return handleCors(response, request, true);

  } catch (err) {
    edgeLogger.error('Error processing broadcast request', { operationId, error: err instanceof Error ? err.message : String(err) });
    const errRes = errorResponse('Error processing request', err, 500);
    return handleCors(errRes, request, true);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const response = new Response(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Secret, X-Supabase-Auth');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}