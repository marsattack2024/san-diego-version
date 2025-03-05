// utils/api-logger.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { logger } from './logger';

type ApiHandler<T = any> = (req: NextApiRequest, res: NextApiResponse<T>) => Promise<void> | void;

/**
 * Higher-order function that wraps API handlers with logging functionality
 * Uses a simple approach that doesn't modify response methods
 */
export function withLogging<T = any>(handler: ApiHandler<T>): ApiHandler<T> {
  return async (req: NextApiRequest, res: NextApiResponse<T>) => {
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    const startTime = performance.now();
    
    // Log the incoming request
    logger.info(`API request received`, {
      requestId,
      method: req.method,
      path: req.url,
      important: req.url?.includes('/chat') || req.url?.includes('/vector')
    });
    
    try {
      // Execute the handler
      await handler(req, res);
      
      // Log the response time after handler completes
      const responseTime = Math.round(performance.now() - startTime);
      
      if (responseTime > 1000) {
        logger.warn(`Slow API response (${responseTime}ms)`, {
          requestId,
          method: req.method,
          path: req.url,
          responseTime,
          important: true
        });
      } else {
        logger.info(`API request completed`, {
          requestId,
          method: req.method,
          path: req.url,
          responseTime,
          important: false
        });
      }
    } catch (error) {
      // Log any unhandled errors
      const responseTime = Math.round(performance.now() - startTime);
      
      logger.error('Unhandled API error', {
        requestId,
        method: req.method,
        path: req.url,
        responseTime,
        error,
        important: true
      });
      
      // Return error response if headers not sent yet
      if (!res.writableEnded) {
        res.status(500).json({ error: 'Internal server error' } as any);
      }
    }
  };
} 