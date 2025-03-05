import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

export async function GET() {
  try {
    // In a real application, you would fetch history from a database
    // For now, we'll return an empty array
    edgeLogger.info('Fetching chat history');
    
    return NextResponse.json([]);
  } catch (error) {
    edgeLogger.error('Failed to fetch chat history', { error });
    
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
} 