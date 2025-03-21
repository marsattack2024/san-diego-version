import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth-utils';

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
      error,
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