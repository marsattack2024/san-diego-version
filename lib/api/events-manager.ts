import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Define the ReadableStreamController type for server-side event streaming
type ReadableStreamController<T> = ReadableStreamDefaultController<T>;

// Track active connections on the server side with user context
type ClientInfo = {
  controller: ReadableStreamController<Uint8Array>;
  userId?: string;
};

// Update from Set to Map to associate user IDs with controllers
const serverClients = new Map<ReadableStreamController<Uint8Array>, ClientInfo>();

/**
 * Send an event to all connected event stream clients
 * Optionally filter by user ID for targeted notifications
 */
export function sendEventToClients(
  event: { type: string; status: string; details?: string },
  targetUserId?: string
) {
  const eventData = `data: ${JSON.stringify(event)}\n\n`;

  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(eventData);

  // Send to all connected clients, optionally filtering by userId
  serverClients.forEach((clientInfo, controller) => {
    // Skip if target user specified and this isn't them
    if (targetUserId && clientInfo.userId !== targetUserId) {
      return;
    }

    try {
      controller.enqueue(data);
    } catch (err: unknown) {
      edgeLogger.error('Error sending event to client', {
        error: err instanceof Error ? err.message : String(err),
        userId: clientInfo.userId?.substring(0, 8) + '...' || 'unknown'
      });
      // Remove failed clients from the map
      serverClients.delete(controller);
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
 * @param controller The ReadableStreamController to add
 * @param userId Optional user ID for targeted notifications
 */
export function addEventClient(
  controller: ReadableStreamController<Uint8Array>,
  userId?: string
) {
  serverClients.set(controller, { controller, userId });

  if (userId) {
    edgeLogger.debug('Added event client with user context', {
      userId: userId.substring(0, 8) + '...',
      totalClients: serverClients.size
    });
  }
}

/**
 * Remove a client controller from the connected clients list
 */
export function removeEventClient(controller: ReadableStreamController<Uint8Array>) {
  const clientInfo = serverClients.get(controller);
  serverClients.delete(controller);

  if (clientInfo?.userId) {
    edgeLogger.debug('Removed event client with user context', {
      userId: clientInfo.userId.substring(0, 8) + '...',
      totalClients: serverClients.size
    });
  }
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