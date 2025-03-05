/**
 * Minimal client-side logger for browser environments
 * Features:
 * - Throttles error reporting to prevent flooding
 * - Only sends errors to server in production
 * - Provides standard log levels with environment awareness
 */

interface ClientLogMessage {
  message: string;
  data?: any;
  timestamp: string;
  level: string;
  url: string;
}

export const clientLogger = {
  // Track last error timestamp to prevent flooding
  lastErrorTime: 0,
  
  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(message, data || '');
    }
  },
  
  info(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.info(message, data || '');
    }
  },
  
  warn(message: string, data?: any) {
    console.warn(message, data || '');
  },
  
  error(message: string | Error, data?: any) {
    // Always log to console
    console.error(message, data || '');
    
    // Only send errors to server in production and throttle them
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
      const now = Date.now();
      
      // Limit to one error per minute per client
      if (now - this.lastErrorTime > 60000) {
        this.lastErrorTime = now;
        
        const logMessage: ClientLogMessage = {
          message: message instanceof Error ? message.message : message,
          data: {
            ...data,
            stack: message instanceof Error ? message.stack : undefined
          },
          timestamp: new Date().toISOString(),
          level: 'error',
          url: window.location.href
        };
        
        // Simple error reporting to server
        fetch('/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logMessage),
          keepalive: true
        }).catch(() => {/* Ignore send failures */});
      }
    }
  },
  
  // Track current correlation ID for client-side logs
  correlationId: '',
  
  // Set correlation ID from server response
  setCorrelationId(id: string) {
    this.correlationId = id;
  },
  
  // Get current correlation ID
  getCorrelationId(): string {
    return this.correlationId;
  }
}; 