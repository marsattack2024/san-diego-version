/**
 * EventSource connection manager to handle reconnections and prevent duplicates
 */
export class EventsManager {
  private static instance: EventsManager | null = null;
  private eventSource: EventSource | null = null;
  private chatId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private baseReconnectDelay: number = 1000; // 1 second
  
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
      
      console.log(`EventSource connected for chat ${chatId}`);
    }
  }
  
  /**
   * Close the current connection
   */
  public close(): void {
    if (this.eventSource) {
      console.log(`Closing EventSource for chat ${this.chatId}`);
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
      console.log(`Max reconnect attempts (${this.maxReconnectAttempts}) reached or no chatId`);
      this.close();
      return;
    }
    
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    
    console.log(`Reconnecting EventSource in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
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