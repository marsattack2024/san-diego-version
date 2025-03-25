import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { Chat } from '@/lib/db/schema';
import { User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

// LRU Cache for server-side history caching across requests
const historyCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds
const MAX_CACHE_ITEMS = 1000;

// Circuit breaker pattern
let consecutiveErrors = 0;
let lastErrorTime = 0;
const ERROR_THRESHOLD = 5;
const ERROR_TIMEOUT = 60 * 1000; // 1 minute

function formatError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function getCachedHistory(userId: string) {
  const cacheKey = `history:${userId}`;
  const cachedItem = historyCache.get(cacheKey);
  
  if (cachedItem && (Date.now() - cachedItem.timestamp) < CACHE_TTL) {
    return cachedItem.data;
  }
  
  return null;
}

function setCachedHistory(userId: string, data: any) {
  const cacheKey = `history:${userId}`;
  
  // If cache is getting too large, remove oldest entries
  if (historyCache.size >= MAX_CACHE_ITEMS) {
    const entries = Array.from(historyCache.entries());
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    // Remove oldest 10% of entries
    const deleteCount = Math.ceil(MAX_CACHE_ITEMS * 0.1);
    entries.slice(0, deleteCount).forEach(([key]) => historyCache.delete(key));
  }
  
  historyCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Generate a unique request ID for tracing
  const operationId = `hist_${Math.random().toString(36).substring(2, 10)}`;
  
  try {
    // Log auth headers for debugging
    const headersList = request.headers;
    edgeLogger.debug('History API received auth headers', {
      userId: headersList.get('x-supabase-auth') || 'missing',
      isAuthValid: headersList.get('x-auth-valid') || 'missing',
      authTime: headersList.get('x-auth-time') || 'missing',
      hasProfile: headersList.get('x-has-profile') || 'missing',
      operationId,
    });
    
    // Direct authentication using Supabase - this is the most reliable method
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      edgeLogger.warn('User not authenticated when fetching history', {
        operationId
      });
      
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get the date range from query parameters
    const { searchParams } = new URL(request.url);
    const timestampParam = searchParams.get('t');
    
    // This serves as a cache-busting timestamp
    if (timestampParam) {
      edgeLogger.debug('Timestamp param received', { timestamp: timestampParam });
    }
    
    // Fetch user's chat sessions with Supabase query
    const { data: sessions, error } = await supabase
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at, agent_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);
    
    if (error) {
      edgeLogger.error('Error fetching chat sessions', { 
        error, 
        userId: user.id,
        operationId 
      });
      
      return NextResponse.json(
        { error: 'Error fetching chat history' }, 
        { status: 500 }
      );
    }
    
    // Return formatted history data - changed to return array format
    const chats = (sessions || []).map(session => ({
      id: session.id,
      title: session.title || 'New Chat',
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      userId: user.id,
      agentId: session.agent_id
    }));
    
    edgeLogger.info('Successfully fetched chat history', {
      count: chats.length,
      userId: user.id,
      operationId
    });
    
    // Return array format directly as expected by the client
    const response = NextResponse.json(chats);
    
    // Set cache control headers - short TTL to allow freshness
    response.headers.set('Cache-Control', 'private, max-age=5');
    
    return response;
  } catch (error) {
    // Get auth headers for debugging
    const headers = request.headers;
    edgeLogger.error('Error in history API', { 
      error: error instanceof Error ? error.message : String(error),
      userId: headers.get('x-supabase-auth') || 'unknown',
      operationId,
      errorObject: error instanceof Error ? error.stack : null
    });
    
    return NextResponse.json(
      { error: 'An error occurred' }, 
      { status: 500 }
    );
  }
}

// Handle chat deletion
export async function DELETE(request: NextRequest) {
  const operationId = `del_${Math.random().toString(36).substring(2, 10)}`;
  
  try {
    // Direct authentication using Supabase
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      edgeLogger.warn('User not authenticated when deleting chat', { operationId });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get the chat ID from the URL
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      edgeLogger.warn('No chat ID provided for deletion', { operationId });
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 }
      );
    }
    
    // Delete the chat session
    const { error } = await supabase
      .from('sd_chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Ensure user can only delete their own chats
    
    if (error) {
      edgeLogger.error('Error deleting chat', {
        error,
        chatId: id,
        userId: user.id,
        operationId
      });
      
      return NextResponse.json(
        { error: 'Failed to delete chat' },
        { status: 500 }
      );
    }
    
    edgeLogger.info('Chat deleted successfully', {
      chatId: id,
      userId: user.id,
      operationId
    });
    
    // Invalidate cache for this user
    const cacheKey = `history:${user.id}`;
    historyCache.delete(cacheKey);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    edgeLogger.error('Error in delete chat API', {
      error: error instanceof Error ? error.message : String(error),
      operationId,
      errorObject: error instanceof Error ? error.stack : null
    });
    
    return NextResponse.json(
      { error: 'An error occurred while deleting the chat' },
      { status: 500 }
    );
  }
}