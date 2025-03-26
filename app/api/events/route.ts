import { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Define the ReadableStreamController type that wasn't properly imported
type ReadableStreamController<T> = ReadableStreamDefaultController<T>;

// Global event emitter for server-sent events
export const runtime = 'edge';

// Track active connections
const clients = new Set<ReadableStreamController<Uint8Array>>();

// Function to send an event to all connected clients
export function sendEventToClients(event: { type: string; status: string; details?: string }) {
  const eventData = `data: ${JSON.stringify(event)}\n\n`;
  
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(eventData);
  
  // Send to all connected clients
  clients.forEach((client) => {
    try {
      client.enqueue(data);
    } catch (err: unknown) {
      edgeLogger.error('Error sending event to client', { 
        error: err instanceof Error ? err.message : String(err) 
      });
      // Remove failed clients from the set
      clients.delete(client);
    }
  });
}

// Connect to the event stream
export async function GET(req: NextRequest) {
  // Performance optimization: Set a maximum client limit to prevent memory issues
  if (clients.size >= 100) {
    edgeLogger.warn('Too many event stream connections', { connectionCount: clients.size });
    return new Response('Too many connections', { status: 503 });
  }

  // Log connection for debugging
  const connectionId = Math.random().toString(36).substring(2, 10);
  edgeLogger.info('New event stream connection', { connectionId });

  // Create a new readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Store the controller for later use
      clients.add(controller);
      
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
          clients.delete(controller);
          edgeLogger.info('Client disconnected during ping', { 
            connectionId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }, 30000);
      
      // Handle cleanup when the connection is closed
      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        clients.delete(controller);
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

// For testing, export a function that can be used to manually trigger events
export function triggerDeepSearchEvent(status: 'started' | 'completed' | 'failed', details?: string) {
  sendEventToClients({
    type: 'deepSearch',
    status,
    details
  });
}