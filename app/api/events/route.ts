import { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

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
    } catch (err) {
      edgeLogger.error('Error sending event to client', { error: err });
    }
  });
}

// Connect to the event stream
export async function GET(req: NextRequest) {
  // Create a new readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Store the controller for later use
      clients.add(controller);
      
      // Send a ping event every 30 seconds to keep the connection alive
      const pingInterval = setInterval(() => {
        try {
          const pingData = `data: {"type":"ping"}\n\n`;
          controller.enqueue(new TextEncoder().encode(pingData));
        } catch (err) {
          // If there's an error, the client is probably disconnected
          clearInterval(pingInterval);
          clients.delete(controller);
        }
      }, 30000);
      
      // Handle cleanup when the connection is closed
      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        clients.delete(controller);
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