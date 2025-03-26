import type { NextApiRequest, NextApiResponse } from 'next';
import { withLogging } from '@/lib/logger/api-logger.ts';
import { logger } from '@/lib/logger';

/**
 * Example API route that demonstrates the use of our logging system
 * This route shows how to use correlation IDs and structured logging
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the correlation ID from headers
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  // Log the request with correlation ID
  logger.info('Processing example API request', { requestId });
  
  try {
    // Extract query parameters
    const { name = 'World', delay = '0' } = req.query;
    const delayMs = parseInt(delay as string, 10);
    
    // Simulate processing delay if requested
    if (delayMs > 0) {
      logger.info(`Delaying response for ${delayMs}ms`, { requestId, delayMs });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    // Process the request
    const response = {
      message: `Hello, ${name}!`,
      timestamp: new Date().toISOString(),
      data: {
        correlationId: requestId,
        params: req.query
      }
    };
    
    // Log successful response
    logger.info('Request processed successfully', { requestId });
    
    // Return the response
    return res.status(200).json(response);
  } catch (error) {
    // Error is logged by the withLogging wrapper
    return res.status(500).json({ error: 'Failed to process request' });
  }
}

// Wrap with logging middleware
export default withLogging(handler); 