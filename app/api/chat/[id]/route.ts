import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createClient } from '@/utils/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { PostgrestResponse, PostgrestError, PostgrestSingleResponse, User } from '@supabase/supabase-js';
import { authCache } from '@/utils/auth/auth-cache';

// Add after any runtime configuration, or at the top of the file
export const dynamic = 'force-dynamic';

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
    edgeLogger.error('Authentication error in chat/[id] route', { 
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

// API route to fetch chat messages and handle chat-specific operations
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Next.js App Router requires params to be awaited before access to prevent hydration issues
  const id = (await Promise.resolve(params)).id;
  
  // Start performance tracking
  const startTime = performance.now();
  
  try {
    // Reduce log verbosity to debug level
    edgeLogger.debug('GET chat by ID request', { chatId: id });
    
    // Get authenticated user using the optimized utility
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      edgeLogger.warn('User not authenticated when fetching chat messages');
      return errorResponse;
    }
    
    // Parallel fetch optimization: Fetch both session and messages simultaneously
    const [sessionResult, messagesResult] = await Promise.all([
      // Fetch session data
      serverClient
        .from('sd_chat_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle(),
      
      // Fetch messages data
      serverClient
        .from('sd_chat_histories')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: true })
    ]);
    
    const { data: chatSession, error: sessionError } = sessionResult;
    const { data: messages, error: messagesError } = messagesResult;
    
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
    
    // Prepare response data
    const responseData = {
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
    };
    
    // Enable caching for chat data (short cache, as it can change)
    const response = NextResponse.json(responseData);
    response.headers.set('Cache-Control', 'private, max-age=5');
    
    return response;
  } catch (error) {
    edgeLogger.error('Error in chat/[id] route', { 
      error: error instanceof Error ? error.message : String(error)
    });
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
  // Next.js App Router requires params to be awaited before access to prevent hydration issues
  const id = (await Promise.resolve(params)).id;
  
  try {
    // Get the request body
    const body = await request.json();
    const { title } = body;
    
    // Log the title update request
    edgeLogger.info('Updating chat title', { 
      chatId: id,
      title: title?.substring(0, 30) + (title?.length > 30 ? '...' : '')
    });
    
    if (!title) {
      edgeLogger.warn('No title provided for update', { chatId: id });
      return new Response(JSON.stringify({ error: 'Title is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get authenticated user using the optimized utility
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      edgeLogger.warn('Authentication failed when updating chat title', { chatId: id });
      return errorResponse;
    }
    
    // First check if the session exists
    const { data: sessionData, error: sessionCheckError } = await serverClient
      .from('sd_chat_sessions')
      .select('id, title')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
      
    if (sessionCheckError) {
      edgeLogger.error('Error checking chat session before title update', { 
        error: sessionCheckError,
        chatId: id
      });
      return new Response(JSON.stringify({ error: 'Failed to check chat session' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!sessionData) {
      edgeLogger.warn('Chat session not found when updating title', { chatId: id });
      
      // Auto-create the session to recover from error
      const { error: createError } = await serverClient
        .from('sd_chat_sessions')
        .insert({
          id: id,
          user_id: user.id,
          title: title
        });
        
      if (createError) {
        edgeLogger.error('Failed to auto-create chat session during title update', {
          error: createError,
          chatId: id
        });
        return new Response(JSON.stringify({ 
          error: 'Chat session not found and could not be created'
        }), { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      edgeLogger.info('Auto-created chat session during title update', { 
        chatId: id,
        title: title?.substring(0, 30) + (title?.length > 30 ? '...' : '')
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Chat session created with title'
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Update the chat session title
    const { error } = await serverClient
      .from('sd_chat_sessions')
      .update({ title })
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      edgeLogger.error('Failed to update chat title', { error, chatId: id });
      return new Response(JSON.stringify({ error: 'Failed to update chat title' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    edgeLogger.info('Successfully updated chat title', { 
      chatId: id,
      previousTitle: sessionData.title || 'None',
      newTitle: title?.substring(0, 30) + (title?.length > 30 ? '...' : '')
    });
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Chat title updated successfully'
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    edgeLogger.error('Error in PATCH handler for chat title', { 
      error: error instanceof Error ? error.message : String(error),
      errorMessage: typeof error === 'object' ? (error as any).message : String(error)
    });
    return new Response(JSON.stringify({ 
      error: 'Failed to update chat title' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Save assistant message (called from frontend after streaming completes)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Next.js App Router requires params to be awaited before access to prevent hydration issues
  const id = (await Promise.resolve(params)).id;
  
  try {
    // Get the message from the request body
    const body = await request.json();
    const { message, messageId, updateTimestamp = true } = body;
    
    // Validate the message format
    if (!message || !message.role || !message.content) {
      edgeLogger.warn('Invalid message format', { chatId: id });
      return new Response(JSON.stringify({ error: 'Invalid message format' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      edgeLogger.warn('Authentication failed when saving message', { chatId: id });
      return errorResponse;
    }
    
    // Format tools used data for storage - handle both array and object formats
    let formattedToolsUsed = null;
    
    if (message.toolsUsed) {
      // Already an array, use as-is
      if (Array.isArray(message.toolsUsed)) {
        formattedToolsUsed = message.toolsUsed;
      } 
      // String value, parse if it's JSON
      else if (typeof message.toolsUsed === 'string') {
        try {
          // Try to parse it as JSON
          const parsed = JSON.parse(message.toolsUsed);
          formattedToolsUsed = parsed;
        } catch {
          // Not valid JSON, use as a simple string array
          formattedToolsUsed = [message.toolsUsed];
        }
      }
      // Object value, convert to array of keys
      else if (typeof message.toolsUsed === 'object') {
        formattedToolsUsed = Object.keys(message.toolsUsed);
      }
    }
    
    edgeLogger.info('Saving chat message', {
      sessionId: id,
      messageId: messageId || 'auto-generated',
      role: message.role,
      contentLength: message.content.length,
      hasTools: !!formattedToolsUsed
    });
    
    // Save the message to the database with fallback logic
    const result = await saveMessageWithFallback(
      serverClient,
      id, 
      {
        role: message.role,
        content: message.content
      },
      user.id,
      formattedToolsUsed, 
      updateTimestamp,
      messageId // Always provide a message ID
    );
    
    // Check if we got a proper response object
    if (result instanceof Response) {
      edgeLogger.info('Message saved successfully', {
        sessionId: id,
        messageId: messageId || 'auto-generated',
        role: message.role,
        responseStatus: (result as Response).status
      });
      return result;
    } else {
      // This shouldn't happen but handle it just in case
      edgeLogger.error('Unexpected response type from saveMessageWithFallback', {
        responseType: typeof result
      });
      
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        details: 'Unexpected response type'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    edgeLogger.error('Error in POST handler', { 
      error: error instanceof Error ? error.message : String(error),
      sessionId: id,
      errorMessage: typeof error === 'object' ? (error as any).message : String(error) 
    });
    return new Response(JSON.stringify({ 
      error: 'Failed to save message' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Helper function to set a timeout on a promise
 * @param promise The promise to add a timeout to
 * @param ms Timeout in milliseconds
 * @param errorMessage Error message to throw on timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage = 'Operation timed out'): Promise<T> {
  // Create a promise that rejects after specified milliseconds
  const timeoutPromise = new Promise<T>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`${errorMessage} (${ms}ms)`));
    }, ms);
  });

  // Race the original promise against the timeout
  return Promise.race([promise, timeoutPromise]);
}

// Helper function for message saving
async function saveMessageWithFallback(
  serverClient: any,
  sessionId: string,
  message: { role: string, content: string },
  userId: string,
  toolsUsed: any,
  updateTimestamp: boolean,
  messageId?: string
): Promise<Response> {
  try {
    // Enhanced validation
    if (!userId) {
      edgeLogger.error('saveMessageWithFallback called with null/undefined userId', {
        sessionId: sessionId,
        messageRole: message.role
      });
      return NextResponse.json({ 
        error: 'User ID is required',
        details: 'Cannot save message without a valid user ID'
      }, { status: 400 });
    }
    
    // Ensure we have a valid message ID
    const finalMessageId = messageId || crypto.randomUUID();
    
    try {
      // First, try to use the RPC function for better performance
      // This function handles session creation internally if needed
      edgeLogger.info('Calling save_message_and_update_session RPC', { 
        sessionId: sessionId, 
        messageId: finalMessageId,
        role: message.role,
        contentLength: message.content.length,
        hasToolsUsed: toolsUsed !== null,
        updateTimestamp: !!updateTimestamp,
        userIdPrefix: userId.substring(0, 8) // Log first 8 chars for traceability
      });
      
      // Log the exact parameters being sent to the RPC function
      edgeLogger.info('RPC function parameters', {
        p_session_id: sessionId,
        p_role: message.role,
        p_content_length: message.content.length,
        p_user_id: userId,
        p_message_id: finalMessageId,
        has_p_tools_used: toolsUsed !== null,
        p_update_timestamp: updateTimestamp
      });
      
      // Call the PostgreSQL function via RPC with timeout
      const rpcPromise = serverClient.rpc('save_message_and_update_session', {
        p_session_id: sessionId,
        p_role: message.role,
        p_content: message.content,
        p_user_id: userId,
        p_message_id: finalMessageId,
        p_tools_used: toolsUsed,
        p_update_timestamp: updateTimestamp
      });
      
      // Add timeout to prevent hanging
      const { data, error } = await withTimeout<PostgrestSingleResponse<any>>(
        rpcPromise, 
        5000, 
        'RPC call timed out'
      );

      // Enhanced logging - log the full response data BEFORE checking errors
      edgeLogger.info('RPC Response Details', {
        hasError: !!error,
        responseData: data ? JSON.stringify(data).substring(0, 1000) : null,
        errorDetails: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        } : null,
        sessionId,
        messageRole: message.role,
        messageLength: message.content.length
      });
      
      // Handle specific error types differently
      if (error) {
        // Track RPC errors by role for metrics
        edgeLogger.warn(`RPC error when saving ${message.role} message`, {
          errorCode: error.code,
          errorMessage: error.message,
          sessionId,
          messageId: finalMessageId
        });
        
        // Only fall back on critical error conditions that indicate function unavailability
        if (error.code === 'PGRST301' || error.code === '42883' || error.message.includes('function') && error.message.includes('does not exist')) {
          edgeLogger.error('SQL function not available, using fallback method', { 
            error, 
            errorCode: error.code,
            errorMessage: error.message
          });
          // Fall through to fallback method below
        } else {
          // For other errors, return error immediately rather than attempting fallback
          edgeLogger.error('Database operation failed with non-recoverable error', {
            error,
            errorCode: error.code,
            errorMessage: error.message,
            sessionId,
            messageId: finalMessageId
          });
          
          return NextResponse.json({ 
            error: 'Database operation failed',
            details: error.message,
            code: error.code
          }, { status: 500 });
        }
      } else {
        // RPC was successful
        edgeLogger.info('RPC call successful', { 
          resultData: JSON.stringify(data).substring(0, 500),
          sessionId,
          messageId: data && data.message_id ? data.message_id : finalMessageId,
          role: message.role,
          success: data?.success,
          executionTimeMs: data?.execution_time_ms
        });
        
        // Return success response with consistent message ID format
        return NextResponse.json({ 
          success: true,
          message: 'Message saved successfully via RPC',
          messageId: data && data.message_id ? data.message_id : finalMessageId,
          role: message.role,
          rpcResponseDetails: data ? {
            success: data.success,
            executionTimeMs: data.execution_time_ms,
            message: data.message
          } : null
        });
      }
    } catch (rpcError) {
      edgeLogger.error('Error during RPC call', { 
        error: rpcError instanceof Error ? rpcError.message : String(rpcError),
        sessionId,
        errorMessage: typeof rpcError === 'object' ? (rpcError as any).message : String(rpcError),
        stack: typeof rpcError === 'object' && (rpcError as any).stack ? (rpcError as any).stack : 'No stack trace',
        messageRole: message.role
      });
      // Fall through to the fallback method
    }
    
    // ------------------------------
    // FALLBACK METHOD STARTS HERE
    // ------------------------------
    
    // If we get here, the RPC failed, so we'll try the direct method
    edgeLogger.warn('Using fallback method to save message', { 
      sessionId, 
      messageId: finalMessageId,
      role: message.role,
      rpcFailed: true
    });
    
    try {
      // First check if the chat session exists (important)
      edgeLogger.info('Checking if session exists in fallback method', {
        sessionId,
        userIdPrefix: userId.substring(0, 8)
      });
      
      const sessionPromise = serverClient
        .from('sd_chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();
        
      const { data: sessionData, error: sessionError } = await withTimeout<PostgrestSingleResponse<{id: string}>>(
        sessionPromise, 
        3000, 
        'Session check timed out'
      );
        
      if (sessionError) {
        edgeLogger.error('Error checking if chat session exists', {
          error: sessionError,
          errorCode: sessionError.code,
          errorMessage: sessionError.message,
          sessionId,
          userIdPrefix: userId.substring(0, 8)
        });
        
        return NextResponse.json(
          { 
            error: 'Error checking if chat session exists',
            details: sessionError.message
          },
          { status: 500 }
        );
      }
      
      if (!sessionData) {
        // Session doesn't exist - attempt to create it
        edgeLogger.warn('Chat session not found when saving message - creating new session', { 
          chatId: sessionId, 
          userIdPrefix: userId.substring(0, 8),
          messageRole: message.role
        });
        
        // Create session
        const createSessionPromise = serverClient
          .from('sd_chat_sessions')
          .insert({
            id: sessionId,
            user_id: userId,
            title: 'New Conversation'
          });
          
        const { error: createError } = await withTimeout<PostgrestResponse<any>>(
          createSessionPromise, 
          3000, 
          'Session creation timed out'
        );
        
        if (createError) {
          edgeLogger.error('Failed to create chat session during message save', {
            error: createError,
            errorCode: createError.code,
            errorMessage: createError.message,
            sessionId,
            userIdPrefix: userId.substring(0, 8)
          });
          
          return NextResponse.json(
            { 
              error: 'Failed to create chat session',
              details: createError.message
            },
            { status: 500 }
          );
        }
        
        edgeLogger.info('Created new chat session during message save', {
          sessionId,
          userIdPrefix: userId.substring(0, 8)
        });
      } else {
        edgeLogger.info('Session exists, proceeding with message insert', {
          sessionId,
          userIdPrefix: userId.substring(0, 8)
        });
      }
      
      // Insert the message
      edgeLogger.info('Inserting message via direct DB insert', {
        sessionId,
        messageId: finalMessageId,
        role: message.role,
        contentLength: message.content.length,
        hasToolsUsed: toolsUsed !== null
      });
      
      const insertPromise = serverClient
        .from('sd_chat_histories')
        .insert({
          id: finalMessageId,
          session_id: sessionId,
          user_id: userId,
          role: message.role,
          content: message.content,
          tools_used: toolsUsed
        });
        
      const { data: insertData, error: insertError } = await withTimeout<PostgrestResponse<any>>(
        insertPromise, 
        5000, 
        'Message insertion timed out'
      );
      
      if (insertError) {
        edgeLogger.error('Failed to insert message', {
          error: insertError,
          errorCode: insertError.code,
          errorMessage: insertError.message,
          sessionId,
          messageId: finalMessageId,
          role: message.role
        });
        
        return NextResponse.json(
          { 
            error: 'Failed to insert message',
            details: insertError.message
          },
          { status: 500 }
        );
      }
      
      edgeLogger.info('Message inserted successfully', {
        sessionId,
        messageId: finalMessageId,
        role: message.role
      });
      
      // Update the session timestamp if requested
      if (updateTimestamp) {
        edgeLogger.info('Updating session timestamp', { 
          sessionId,
          updateRequested: true
        });
        
        const updatePromise = serverClient
          .from('sd_chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);
          
        const { error: updateError } = await withTimeout<PostgrestResponse<any>>(
          updatePromise, 
          3000, 
          'Session timestamp update timed out'
        );
        
        if (updateError) {
          edgeLogger.warn('Failed to update session timestamp, but message was saved', {
            error: updateError,
            errorCode: updateError.code,
            errorMessage: updateError.message,
            sessionId
          });
          // We don't fail the request if only the timestamp update fails
        } else {
          edgeLogger.info('Session timestamp updated successfully', { sessionId });
        }
      }
      
      edgeLogger.info('Message saved successfully via fallback method', {
        sessionId,
        messageId: finalMessageId,
        role: message.role
      });
      
      return NextResponse.json({ 
        success: true,
        message: 'Message saved successfully via fallback method',
        messageId: finalMessageId,
        chatId: finalMessageId // Include chatId for backward compatibility
      });
    } catch (error) {
      edgeLogger.error('Fallback method failed', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        messageId: finalMessageId,
        errorMessage: typeof error === 'object' ? (error as any).message : String(error),
        stack: typeof error === 'object' && (error as any).stack ? (error as any).stack : 'No stack trace'
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to save message via fallback method',
          details: typeof error === 'object' ? (error as any).message : String(error)
        },
        { status: 500 }
      );
    }
  } catch (error) {
    // Ensure finalMessageId is defined in this scope
    const finalMessageId = messageId || '[unknown-id]';
    
    edgeLogger.error('Error saving message', { 
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      messageId: finalMessageId,
      role: message.role,
      contentLength: message.content.length
    });
    
    // Return error response
    return new Response(JSON.stringify({ 
      error: 'Failed to save message', 
      details: error instanceof Error ? error.message : String(error)
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}