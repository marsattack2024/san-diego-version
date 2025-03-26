import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { authCache } from '@/utils/auth/auth-cache';
import { createClient } from '@/utils/supabase/server';
import type { User } from '@supabase/supabase-js';

// Allow dynamic behavior
export const dynamic = 'force-dynamic';

/**
 * API route to create a new chat session
 * This ensures the session exists in the database before messages are sent
 */
export async function POST(request: NextRequest) {
  try {
    // Get request body
    const body = await request.json();
    const { id, title, agentId = 'default', deepSearchEnabled = false } = body;
    
    edgeLogger.info('Chat session creation request received', {
      sessionId: id,
      hasTitle: !!title,
      agentId,
      deepSearchEnabled
    });
    
    if (!id) {
      edgeLogger.warn('Missing session ID in request');
      return new Response(JSON.stringify({ error: 'Missing session ID' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fast path: Check if session is already validated in cache
    if (authCache.isSessionValid(id)) {
      edgeLogger.debug('Session validation cache hit', { sessionId: id });
      
      return new Response(JSON.stringify({ 
        id, 
        exists: true,
        cached: true,
        message: 'Session validated from cache' 
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      edgeLogger.warn('Authentication failed during session creation', { 
        sessionId: id
      });
      return errorResponse;
    }
    
    edgeLogger.info('Creating new chat session', {
      sessionId: id,
      userId: user.id,
      agentId,
      deepSearchEnabled
    });
    
    // Check if the session already exists
    const { data: existingSession, error: checkError } = await serverClient
      .from('sd_chat_sessions')
      .select('id, title')
      .eq('id', id)
      .maybeSingle();
    
    if (checkError) {
      edgeLogger.error('Error checking for existing session', {
        error: checkError,
        sessionId: id
      });
      
      return new Response(JSON.stringify({ 
        error: 'Failed to check for existing session',
        details: {
          code: checkError.code,
          message: checkError.message
        }
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (existingSession) {
      // Mark session as valid in cache
      authCache.markSessionValid(id);
      
      edgeLogger.info('Chat session already exists', { 
        sessionId: id,
        existingTitle: existingSession.title || 'None'
      });
      
      return new Response(JSON.stringify({ 
        id, 
        exists: true,
        title: existingSession.title,
        message: 'Session already exists' 
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create the chat session
    const { error } = await serverClient
      .from('sd_chat_sessions')
      .insert({
        id,
        user_id: user.id,
        title: title || 'New Conversation',
        agent_id: agentId,
        deep_search_enabled: deepSearchEnabled
      });
    
    if (error) {
      edgeLogger.error('Failed to create chat session', {
        error,
        errorCode: error.code,
        errorMessage: error.message,
        sessionId: id,
        userId: user.id
      });
      
      return new Response(JSON.stringify({ 
        error: 'Failed to create session',
        details: {
          code: error.code,
          message: error.message
        }
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Mark session as valid in cache after successful creation
    authCache.markSessionValid(id);
    
    edgeLogger.info('Chat session created successfully', {
      sessionId: id,
      userId: user.id,
      title: title || 'New Conversation'
    });
    
    return new Response(JSON.stringify({
      id,
      success: true,
      message: 'Session created successfully'
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    edgeLogger.error('Unhandled error in chat session creation', { 
      error: error instanceof Error ? error.message : String(error),
      errorMessage: typeof error === 'object' ? (error as any).message : String(error)
    });
    
    return new Response(JSON.stringify({ 
      error: 'An error occurred during session creation'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper for direct authentication
async function getAuthenticatedUser(request?: NextRequest) {
  try {
    // Create client for DB operations
    const supabase = await createClient();
    
    // Direct authentication using Supabase
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      return { 
        user, 
        serverClient: supabase,
        errorResponse: null 
      };
    }
    
    return { 
      user: null, 
      serverClient: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    };
  } catch (error) {
    edgeLogger.error('Authentication error in session route', { 
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      user: null,
      serverClient: null,
      errorResponse: NextResponse.json(
        { error: 'Authentication error' },
        { status: 500 }
      )
    };
  }
}

export async function GET(_request: NextRequest) {
  const requestId = `sess-${Math.random().toString(36).substring(2, 10)}`;
  
  try {
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(_request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    // Return 401 if no user (should not happen if errorResponse is set correctly)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get query parameters
    const { searchParams } = new URL(_request.url);
    const chatId = searchParams.get('id');
    
    // Return 400 if no chat ID provided
    if (!chatId) {
      return NextResponse.json({ error: 'Missing chat ID' }, { status: 400 });
    }
    
    // Get chat session
    const { data: session, error } = await serverClient
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at, user_id, agent_id, config')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();
    
    // If error or no session found, return 404
    if (error || !session) {
      edgeLogger.error('Error getting chat session', { 
        error, 
        chatId, 
        userId: user.id,
        requestId
      });
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }
    
    // Get chat messages
    const { data: messages, error: messagesError } = await serverClient
      .from('sd_chat_messages')
      .select('id, role, content, created_at, tools_used')
      .eq('session_id', chatId)
      .order('created_at');
    
    if (messagesError) {
      edgeLogger.error('Error getting chat messages', { 
        error: messagesError, 
        chatId, 
        userId: user.id,
        requestId
      });
      return NextResponse.json({ error: 'Failed to get chat messages' }, { status: 500 });
    }
    
    return NextResponse.json({
      session,
      messages: messages || [],
    });
  } catch (error) {
    edgeLogger.error('Unexpected error in chat session endpoint', { 
      error: error instanceof Error ? error.message : String(error),
      requestId 
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}