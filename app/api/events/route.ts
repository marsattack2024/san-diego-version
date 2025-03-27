import { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { 
  sendEventToClients, 
  addEventClient, 
  removeEventClient, 
  getClientCount 
} from '@/lib/api/events-manager';

// Global event emitter for server-sent events
export const runtime = 'edge';

// Connect to the event stream
export async function GET(req: NextRequest) {
  // Performance optimization: Set a maximum client limit to prevent memory issues
  if (getClientCount() >= 100) {
    edgeLogger.warn('Too many event stream connections', { connectionCount: getClientCount() });
    return new Response('Too many connections', { status: 503 });
  }

  // Log connection for debugging
  const connectionId = Math.random().toString(36).substring(2, 10);
  edgeLogger.info('New event stream connection', { connectionId });

  // Create a new readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Store the controller for later use
      addEventClient(controller);
      
      // Send initial connection event
      const connectionEvent = `data: {"type":"connected","connectionId":"${connectionId}"}\n\n`;
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
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }, 30000);
      
      // Handle cleanup when the connection is closed
      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        removeEventClient(controller);
        edgeLogger.info('Client disconnected', { connectionId });
      });
    }
  });

  // Return the stream as a server-sent event response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
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