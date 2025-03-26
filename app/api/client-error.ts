import type { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '@/lib/logger';
import { withRequestTracking } from '@/lib/logger/edge-logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, data, url } = req.body;
    
    // Log client error with server logger
    logger.error(`Client error: ${message}`, {
      clientData: data,
      clientUrl: url,
      userAgent: req.headers['user-agent'],
      important: true
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
}

export default withRequestTracking(handler); 