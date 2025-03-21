import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { getAuthenticatedUser } from '@/lib/supabase/auth-utils';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// Define types for our data structures
interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  user_id: string;
  tools_used?: any;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SessionMap {
  [key: string]: ChatSession;
}

// Debug endpoint to check chat histories
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    // Get the session ID from query params if provided
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    edgeLogger.info('Debug checking chat histories', {
      userId: user.id,
      sessionId: sessionId || 'all',
      limit
    });
    
    // Query to get recent histories
    let query = serverClient
      .from('sd_chat_histories')
      .select('id, session_id, role, content, created_at, user_id, tools_used')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Filter by session ID if provided
    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }
    
    const { data: messages, error: messagesError } = await query;
    
    if (messagesError) {
      edgeLogger.error('Error fetching chat histories for debug', {
        error: messagesError,
        userId: user.id
      });
      return NextResponse.json({ error: 'Failed to fetch chat histories' }, { status: 500 });
    }
    
    // Get distinct sessions involved
    const sessionIds = [...new Set((messages as ChatMessage[])?.map(m => m.session_id) || [])];
    
    // Get session info for these sessions
    const { data: sessions, error: sessionsError } = await serverClient
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at')
      .in('id', sessionIds);
    
    // Create session lookup map
    const sessionMap: SessionMap = {};
    (sessions as ChatSession[])?.forEach(s => {
      sessionMap[s.id] = s;
    });
    
    // Build response data
    return NextResponse.json({
      messageCount: messages?.length || 0,
      sessionCount: sessionIds.length,
      messages: (messages as ChatMessage[])?.map(m => ({
        id: m.id,
        sessionId: m.session_id,
        sessionTitle: sessionMap[m.session_id]?.title || 'Unknown',
        role: m.role,
        content: m.content.length > 100 ? `${m.content.substring(0, 100)}...` : m.content,
        contentLength: m.content.length,
        createdAt: m.created_at,
        hasToolsUsed: !!m.tools_used
      })),
      sessions: sessionMap,
      userInfo: {
        id: user.id
      }
    });
  } catch (error) {
    edgeLogger.error('Error in debug/histories endpoint', { error });
    return NextResponse.json({ error: 'Debug check failed', details: String(error) }, { status: 500 });
  }
} 