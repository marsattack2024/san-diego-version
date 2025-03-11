import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Add after any runtime configuration, or at the top of the file
export const dynamic = 'force-dynamic';

import { getAuthenticatedUser } from '@/lib/supabase/auth-utils';

// API route to fetch chat messages and handle chat-specific operations
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract ID from params
    const { id } = await Promise.resolve(params);
    
    edgeLogger.info('GET chat by ID request', { chatId: id });
    
    // Get authenticated user using the optimized utility
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      edgeLogger.warn('User not authenticated when fetching chat messages');
      return errorResponse;
    }
    
    // serverClient is already provided by getAuthenticatedUser
    
    // Fetch the chat session first to ensure user has access
    const { data: chatSession, error: sessionError } = await serverClient
      .from('sd_chat_sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (sessionError) {
      edgeLogger.error('Database error when fetching chat session', { 
        error: sessionError, 
        chatId: id,
        userId: user.id 
      });
      return NextResponse.json(
        { error: 'Database error when fetching chat' },
        { status: 500 }
      );
    }
    
    if (!chatSession) {
      edgeLogger.warn('Chat session not found or user not authorized', { 
        chatId: id,
        userId: user.id 
      });
      
      // Return 404 instead of creating a new chat
      return NextResponse.json(
        { error: 'Chat not found or access denied' },
        { status: 404 }
      );
    }
    
    // Fetch chat messages
    const { data: messages, error: messagesError } = await serverClient
      .from('sd_chat_histories')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });
    
    if (messagesError) {
      edgeLogger.error('Failed to fetch chat messages', { 
        error: messagesError, 
        chatId: id 
      });
      return NextResponse.json(
        { error: 'Failed to fetch chat messages' },
        { status: 500 }
      );
    }
    
    // Return chat session with messages
    return NextResponse.json({
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.created_at,
      updatedAt: chatSession.updated_at,
      userId: chatSession.user_id,
      agentId: chatSession.agent_id,
      deepSearchEnabled: chatSession.deep_search_enabled,
      messages: messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at,
        vote: msg.vote,
        toolsUsed: msg.tools_used
      }))
    });
  } catch (error) {
    edgeLogger.error('Error in chat/[id] route', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// Update chat details (title, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract ID from params
    const { id } = await Promise.resolve(params);
    const body = await request.json();
    const { title } = body;
    
    // Get authenticated user using the optimized utility
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    // serverClient is already provided by getAuthenticatedUser
    
    // Update the chat session
    const { error } = await serverClient
      .from('sd_chat_sessions')
      .update({ title })
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      edgeLogger.error('Failed to update chat title', { error, chatId: id });
      return NextResponse.json(
        { error: 'Failed to update chat' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    edgeLogger.error('Error updating chat title', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// Save assistant message (called from frontend after streaming completes)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract ID from params 
    const { id } = await Promise.resolve(params);
    const body = await request.json();
    const { message, toolsUsed } = body;
    
    if (!message || !message.content || !message.role) {
      return NextResponse.json(
        { error: 'Invalid message format' },
        { status: 400 }
      );
    }
    
    // Get authenticated user using the optimized utility
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    // serverClient is already provided by getAuthenticatedUser
    
    // Store the assistant message
    // Properly format toolsUsed for database
    let formattedToolsUsed = null;
    if (toolsUsed) {
      // Check if toolsUsed has a nested tools array and flatten it
      if (toolsUsed.tools && Array.isArray(toolsUsed.tools)) {
        formattedToolsUsed = toolsUsed.tools;
      } else {
        formattedToolsUsed = toolsUsed;
      }
    }
    
    edgeLogger.info('Saving message to chat history', { 
      sessionId: id, 
      role: message.role,
      contentLength: message.content.length,
      hasToolsUsed: formattedToolsUsed !== null
    });
    
    const { error } = await serverClient
      .from('sd_chat_histories')
      .insert({
        session_id: id,
        role: message.role,
        content: message.content,
        user_id: user.id,
        tools_used: formattedToolsUsed
      });
    
    if (error) {
      edgeLogger.error('Failed to save assistant message', { 
        error, 
        chatId: id,
        errorCode: error.code,
        errorMessage: error.message,
        details: error.details
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to save message', 
          details: {
            code: error.code,
            message: error.message,
            details: error.details
          } 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    edgeLogger.error('Error saving assistant message', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}