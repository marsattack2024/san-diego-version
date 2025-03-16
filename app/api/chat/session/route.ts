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
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing session ID' },
        { status: 400 }
      );
    }
    
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    edgeLogger.info('Creating new chat session', {
      sessionId: id,
      userId: user.id,
      agentId,
      deepSearchEnabled
    });
    
    // Check if the session already exists
    const { data: existingSession } = await serverClient
      .from('sd_chat_sessions')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    
    if (existingSession) {
      edgeLogger.info('Chat session already exists', { sessionId: id });
      return NextResponse.json({ 
        id, 
        exists: true,
        message: 'Session already exists' 
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
        sessionId: id,
        userId: user.id
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to create session',
          details: {
            code: error.code,
            message: error.message
          }
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      id,
      success: true,
      message: 'Session created successfully'
    });
  } catch (error) {
    edgeLogger.error('Unhandled error in chat session creation', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}