import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { getAuthenticatedUser } from '@/lib/supabase/auth-utils';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Test endpoint to directly call the RPC function with controlled parameters
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    // Generate test data
    const sessionId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const testContent = `Test message from API at ${new Date().toISOString()}`;
    
    // Log the test parameters
    edgeLogger.info('Testing RPC function with controlled parameters', {
      userId: user.id,
      sessionId,
      messageId,
      contentLength: testContent.length
    });
    
    // Call both user and assistant role to test
    const testRuns = [];
    
    // Test with user role
    const userResult = await serverClient.rpc('save_message_and_update_session', {
      p_session_id: sessionId,
      p_role: 'user',
      p_content: testContent,
      p_user_id: user.id,
      p_message_id: messageId,
      p_tools_used: null,
      p_update_timestamp: true
    });
    
    testRuns.push({
      role: 'user',
      messageId,
      success: !userResult.error,
      data: userResult.data,
      error: userResult.error,
      timestamp: new Date().toISOString()
    });
    
    // Test with assistant role and a different message ID
    const assistantMessageId = crypto.randomUUID();
    const assistantResult = await serverClient.rpc('save_message_and_update_session', {
      p_session_id: sessionId,
      p_role: 'assistant',
      p_content: `Assistant response to test at ${new Date().toISOString()}`,
      p_user_id: user.id,
      p_message_id: assistantMessageId,
      p_tools_used: null,
      p_update_timestamp: true
    });
    
    testRuns.push({
      role: 'assistant',
      messageId: assistantMessageId,
      success: !assistantResult.error,
      data: assistantResult.data,
      error: assistantResult.error,
      timestamp: new Date().toISOString()
    });
    
    // Now verify the messages were actually saved by querying the database
    const { data: savedMessages, error: fetchError } = await serverClient
      .from('sd_chat_histories')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId);
    
    // Return all results
    return NextResponse.json({
      testRuns,
      sessionId,
      verificationQuery: {
        success: !fetchError,
        data: savedMessages,
        error: fetchError,
        count: savedMessages?.length || 0
      },
      user: {
        id: user.id
      }
    });
  } catch (error) {
    edgeLogger.error('Error in test-rpc endpoint', { error });
    return NextResponse.json({ error: 'Test failed', details: String(error) }, { status: 500 });
  }
} 