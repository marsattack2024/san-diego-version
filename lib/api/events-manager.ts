import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Define the ReadableStreamController type for server-side event streaming
type ReadableStreamController<T> = ReadableStreamDefaultController<T>;

// Track active connections on the server side
const serverClients = new Set<ReadableStreamController<Uint8Array>>();

/**
 * Send an event to all connected event stream clients
 * Server-side function to broadcast events to all connected clients
 */
export function sendEventToClients(event: { type: string; status: string; details?: string }) {
  const eventData = `data: ${JSON.stringify(event)}\n\n`;

  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(eventData);

  // Send to all connected clients
  serverClients.forEach((client) => {
    try {
      client.enqueue(data);
    } catch (err: unknown) {
      edgeLogger.error('Error sending event to client', {
        error: err instanceof Error ? err.message : String(err)
      });
      // Remove failed clients from the set
      serverClients.delete(client);
    }
  });
}

/**
 * Helper function to trigger deep search events
 */
export function triggerDeepSearchEvent(status: 'started' | 'completed' | 'failed', details?: string) {
  sendEventToClients({
    type: 'deepSearch',
    status,
    details
  });
}

/**
 * Add a client controller to the connected clients list
 */
export function addEventClient(controller: ReadableStreamController<Uint8Array>) {
  serverClients.add(controller);
}

/**
 * Remove a client controller from the connected clients list
 */
export function removeEventClient(controller: ReadableStreamController<Uint8Array>) {
  serverClients.delete(controller);
}

/**
 * Get the current number of connected clients
 */
export function getClientCount(): number {
  return serverClients.size;
}

/**
 * Client-side EventSource connection manager to handle reconnections and prevent duplicates
 */
export class EventsManager {
  private static instance: EventsManager | null = null;
  private eventSource: EventSource | null = null;
  private chatId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private baseReconnectDelay: number = 1000; // 1 second
  private isConnected: boolean = false;
  private connectionListeners: ((isConnected: boolean) => void)[] = [];

  /**
   * Get singleton instance
   */
  public static getInstance(): EventsManager {
    if (!this.instance) {
      this.instance = new EventsManager();
    }
    return this.instance;
  }

  /**
   * Connect to events endpoint for a specific chat
   */
  public connect(chatId: string, onMessage: (event: MessageEvent) => void): void {
    // Close existing connection if different chat
    if (this.eventSource && this.chatId !== chatId) {
      this.close();
    }

    // Already connected to this chat
    if (this.eventSource && this.chatId === chatId) {
      return;
    }

    this.chatId = chatId;
    this.reconnectAttempts = 0;

    // Only create EventSource in browser environment
    if (typeof window !== 'undefined') {
      // Create new connection
      this.eventSource = new EventSource(`/api/events?chatId=${chatId}`);

      // Set up event handlers
      this.eventSource.onmessage = onMessage;

      this.eventSource.onerror = (error) => {
        console.error('EventSource error', error);
        this.reconnect();
      };

      this.eventSource.addEventListener('open', () => {
        edgeLogger.debug('EventSource connected', {
          category: LOG_CATEGORIES.CHAT,
          chatId: this.chatId
        });
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Notify connection listeners
        this.connectionListeners.forEach(listener => listener(true));
      });
    }
  }

  /**
   * Close the current connection
   */
  public close(): void {
    if (this.eventSource) {
      edgeLogger.debug('Closing EventSource', {
        category: LOG_CATEGORIES.CHAT,
        chatId: this.chatId
      });
      this.eventSource.close();
      this.eventSource = null;
    }
    this.chatId = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private reconnect(): void {
    if (!this.chatId || this.reconnectAttempts >= this.maxReconnectAttempts) {
      edgeLogger.debug('Max reconnect attempts reached', {
        category: LOG_CATEGORIES.CHAT,
        attempts: this.maxReconnectAttempts,
        chatId: this.chatId || 'none'
      });
      this.close();
      return;
    }

    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    edgeLogger.debug('Reconnecting EventSource', {
      category: LOG_CATEGORIES.CHAT,
      delayMs: delay,
      attempt: this.reconnectAttempts,
      chatId: this.chatId
    });

    setTimeout(() => {
      if (this.chatId) {
        // Preserve the chatId and try reconnecting
        const chatIdToReconnect = this.chatId;
        const currentOnMessage = this.eventSource?.onmessage as ((event: MessageEvent) => void) | null;

        this.close();

        if (currentOnMessage) {
          this.connect(chatIdToReconnect, currentOnMessage);
        } else {
          console.error('Cannot reconnect: onMessage handler is missing');
        }
      }
    }, delay);
  }
}

// Export a singleton instance for easy imports
export const eventsManager = EventsManager.getInstance(); 