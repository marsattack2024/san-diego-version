/**
 * Edge-compatible logger for middleware and edge functions
 * Features:
 * - Minimal implementation that works in Edge Runtime
 * - Basic log levels with environment awareness
 * - No dependencies on Node.js specific features
 */

export const edgeLogger = {
  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Edge] ${message}`, data || '');
    }
  },
  
  info(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.info(`[Edge] ${message}`, data || '');
    }
  },
  
  warn(message: string, data?: any) {
    console.warn(`[Edge] ${message}`, data || '');
  },
  
  error(message: string | Error, data?: any) {
    console.error(`[Edge] ${message instanceof Error ? message.message : message}`, {
      ...(data || {}),
      stack: message instanceof Error ? message.stack : undefined
    });
  }
}; 