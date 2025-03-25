import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
// Implementing getAuthenticatedUser inline since we don't have the auth-utils file
async function getAuthenticatedUser(request?: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      return { user, serverClient: supabase, errorResponse: null };
    }
    
    return { 
      user: null, 
      serverClient: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  } catch (error) {
    edgeLogger.error('Authentication error', { error });
    return {
      user: null,
      serverClient: null,
      errorResponse: NextResponse.json({ error: 'Authentication error' }, { status: 500 })
    };
  }
}
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

// Define types for our results
interface ErrorLog {
  step: string;
  error: string;
}

interface TestResult {
  success: boolean;
  messageId?: string;
  sessionId?: string;
  error: {
    code: string;
    message: string;
    details?: string;
  } | null;
  data: any;
  messageCount?: number;
}

interface TestResults {
  sessionCreation: TestResult | null;
  userMessageDirect: TestResult | null;
  assistantMessageDirect: TestResult | null;
  userMessageRPC: TestResult | null;
  assistantMessageRPC: TestResult | null;
  userPolicies: TestResult | null;
  errors: ErrorLog[];
}

// Test endpoint for diagnosing permission issues with message saving
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, serverClient, errorResponse } = await getAuthenticatedUser(request);
    
    // Return error response if authentication failed
    if (errorResponse) {
      return errorResponse;
    }
    
    // Create test session ID and message ID
    const testSessionId = uuidv4();
    const testMessageId = uuidv4();
    const testContent = 'This is a test message for diagnosing permissions';
    
    edgeLogger.info('Starting permissions test', {
      userId: user.id,
      testSessionId,
      testMessageId
    });
    
    // Results container
    const results: TestResults = {
      sessionCreation: null,
      userMessageDirect: null,
      assistantMessageDirect: null,
      userMessageRPC: null,
      assistantMessageRPC: null,
      userPolicies: null,
      errors: []
    };
    
    // Step 1: Try to create a test session
    try {
      const { data: sessionData, error: sessionError } = await serverClient
        .from('sd_chat_sessions')
        .insert({
          id: testSessionId,
          user_id: user.id,
          title: 'Test Session for Permissions'
        })
        .select()
        .single();
      
      results.sessionCreation = {
        success: !sessionError,
        sessionId: testSessionId,
        error: sessionError ? {
          code: sessionError.code,
          message: sessionError.message,
          details: sessionError.details
        } : null,
        data: sessionData
      };
      
      if (sessionError) {
        results.errors.push({
          step: 'session_creation',
          error: sessionError.message
        });
      }
    } catch (err) {
      results.errors.push({
        step: 'session_creation',
        error: String(err)
      });
    }
    
    // Step 2: Try to insert a user message directly
    try {
      const userMessageId = uuidv4();
      const { data: userMessageData, error: userMessageError } = await serverClient
        .from('sd_chat_histories')
        .insert({
          id: userMessageId,
          session_id: testSessionId,
          user_id: user.id,
          role: 'user',
          content: testContent
        })
        .select()
        .single();
      
      results.userMessageDirect = {
        success: !userMessageError,
        messageId: userMessageId,
        error: userMessageError ? {
          code: userMessageError.code,
          message: userMessageError.message,
          details: userMessageError.details
        } : null,
        data: userMessageData
      };
      
      if (userMessageError) {
        results.errors.push({
          step: 'user_message_direct',
          error: userMessageError.message
        });
      }
    } catch (err) {
      results.errors.push({
        step: 'user_message_direct',
        error: String(err)
      });
    }
    
    // Step 3: Try to insert an assistant message directly
    try {
      const assistantMessageId = uuidv4();
      const { data: assistantMessageData, error: assistantMessageError } = await serverClient
        .from('sd_chat_histories')
        .insert({
          id: assistantMessageId,
          session_id: testSessionId,
          user_id: user.id,
          role: 'assistant',
          content: 'This is a test assistant response'
        })
        .select()
        .single();
      
      results.assistantMessageDirect = {
        success: !assistantMessageError,
        messageId: assistantMessageId,
        error: assistantMessageError ? {
          code: assistantMessageError.code,
          message: assistantMessageError.message,
          details: assistantMessageError.details
        } : null,
        data: assistantMessageData
      };
      
      if (assistantMessageError) {
        results.errors.push({
          step: 'assistant_message_direct',
          error: assistantMessageError.message
        });
      }
    } catch (err) {
      results.errors.push({
        step: 'assistant_message_direct',
        error: String(err)
      });
    }
    
    // Step 4: Try to use the RPC function for user message
    try {
      const userRpcMessageId = uuidv4();
      const { data: userRpcData, error: userRpcError } = await serverClient
        .rpc('save_message_and_update_session', {
          p_session_id: testSessionId,
          p_role: 'user',
          p_content: 'This is a test user message via RPC',
          p_user_id: user.id,
          p_message_id: userRpcMessageId,
          p_tools_used: null,
          p_update_timestamp: true
        });
      
      results.userMessageRPC = {
        success: !userRpcError,
        messageId: userRpcMessageId,
        error: userRpcError ? {
          code: userRpcError.code,
          message: userRpcError.message,
          details: userRpcError.details
        } : null,
        data: userRpcData
      };
      
      if (userRpcError) {
        results.errors.push({
          step: 'user_message_rpc',
          error: userRpcError.message
        });
      }
    } catch (err) {
      results.errors.push({
        step: 'user_message_rpc',
        error: String(err)
      });
    }
    
    // Step 5: Try to use the RPC function for assistant message
    try {
      const assistantRpcMessageId = uuidv4();
      const { data: assistantRpcData, error: assistantRpcError } = await serverClient
        .rpc('save_message_and_update_session', {
          p_session_id: testSessionId,
          p_role: 'assistant',
          p_content: 'This is a test assistant message via RPC',
          p_user_id: user.id,
          p_message_id: assistantRpcMessageId,
          p_tools_used: null,
          p_update_timestamp: true
        });
      
      results.assistantMessageRPC = {
        success: !assistantRpcError,
        messageId: assistantRpcMessageId,
        error: assistantRpcError ? {
          code: assistantRpcError.code,
          message: assistantRpcError.message,
          details: assistantRpcError.details
        } : null,
        data: assistantRpcData
      };
      
      if (assistantRpcError) {
        results.errors.push({
          step: 'assistant_message_rpc',
          error: assistantRpcError.message
        });
      }
    } catch (err) {
      results.errors.push({
        step: 'assistant_message_rpc',
        error: String(err)
      });
    }
    
    // Step 6: Check for RLS policies
    try {
      // We don't have a direct way to check RLS policies from the client
      // This would require admin access
      // Instead, we'll attempt to retrieve the messages we just created
      const { data: userPoliciesData, error: userPoliciesError } = await serverClient
        .from('sd_chat_histories')
        .select('id, role, content')
        .eq('session_id', testSessionId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      results.userPolicies = {
        success: !userPoliciesError,
        messageCount: userPoliciesData ? userPoliciesData.length : 0,
        error: userPoliciesError ? {
          code: userPoliciesError.code,
          message: userPoliciesError.message
        } : null,
        data: userPoliciesData
      };
      
      if (userPoliciesError) {
        results.errors.push({
          step: 'check_policies',
          error: userPoliciesError.message
        });
      }
    } catch (err) {
      results.errors.push({
        step: 'check_policies',
        error: String(err)
      });
    }
    
    // Return results
    return NextResponse.json({
      testCompleted: true,
      userId: user.id,
      testSessionId,
      results,
      userInfo: {
        id: user.id,
        email: user.email,
        hasRole: !!results.userPolicies?.data?.length
      }
    });
  } catch (error) {
    edgeLogger.error('Error in test-permissions endpoint', { error });
    return NextResponse.json({ 
      error: 'Test failed', 
      details: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 