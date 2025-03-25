import { NextResponse } from 'next/server';
import { aiRateLimit } from '@/lib/middleware/rate-limit';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createAdminClient } from '@/utils/supabase/server';

// Create a Supabase client with the service role key to bypass RLS
const supabaseAdmin = createAdminClient();

/**
 * Route handler for saving AI-generated messages
 * This endpoint uses the service role to bypass RLS policies
 * It should ONLY be called from the server-side for AI responses
 * 
 * @param request The request object containing the message data
 */
export async function POST(request: Request) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await aiRateLimit(request as any);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    // Parse the request body
    const body = await request.json();
    const { session_id, message, role, userId } = body;
    
    // Validate required fields
    if (!session_id || !message || !role || !userId) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          message: 'session_id, message, role, and userId are required' 
        },
        { status: 400 }
      );
    }
    
    // Ensure this is only used for AI messages 
    if (role !== 'assistant') {
      return NextResponse.json(
        { 
          error: 'Invalid role',
          message: 'This endpoint is only for assistant messages' 
        },
        { status: 400 }
      );
    }
    
    // Verify the chat session exists and belongs to the user
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('sd_chat_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('user_id', userId)
      .single();
    
    if (sessionError || !sessionData) {
      edgeLogger.warn('Attempted to save AI message for invalid session', {
        session_id,
        userId,
        error: sessionError
      });
      
      return NextResponse.json(
        { 
          error: 'Invalid session',
          message: 'The chat session does not exist or does not belong to the user'
        },
        { status: 404 }
      );
    }
    
    // Insert the message using service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('sd_chat_histories')
      .insert({
        session_id,
        role,
        content: message,
        created_at: new Date().toISOString(),
        user_id: userId
      })
      .select()
      .single();
    
    if (error) {
      edgeLogger.error('Error saving AI message', {
        session_id,
        role,
        userId,
        error
      });
      
      return NextResponse.json(
        { 
          error: 'Database error',
          message: 'Failed to save AI message'
        },
        { status: 500 }
      );
    }
    
    // Return the saved message
    return NextResponse.json({ success: true, message: data });
  } catch (error) {
    edgeLogger.error('Unexpected error in AI message API', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'Server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

// No GET method needed for this route
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 