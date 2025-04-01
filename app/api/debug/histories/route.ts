import { createClient as createServerClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { User } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Helper function to get authenticated user
async function getAuthenticatedUser(request: Request): Promise<{
  user: User | null;
  serverClient: SupabaseClient | null;
  errorResponse: Response | null;
}> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      return { user, serverClient: supabase, errorResponse: null };
    }

    return {
      user: null,
      serverClient: null,
      errorResponse: unauthorizedError('Authentication required to access debug histories')
    };
  } catch (error) {
    edgeLogger.error('Authentication error', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      user: null,
      serverClient: null,
      errorResponse: errorResponse('Authentication error', error instanceof Error ? error.message : String(error), 500)
    };
  }
}

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
export async function GET(request: Request): Promise<Response> {
  try {
    // Get authenticated user
    const { user, serverClient, errorResponse: authError } = await getAuthenticatedUser(request);

    // Return error response if authentication failed
    if (authError) {
      return authError;
    }

    // Type guard to ensure serverClient and user are defined
    if (!user || !serverClient) {
      return unauthorizedError('User authentication failed');
    }

    // Now TypeScript knows serverClient and user are defined in this scope
    // Get the session ID from query params if provided
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    edgeLogger.info('Debug checking chat histories', {
      category: LOG_CATEGORIES.SYSTEM,
      userId: user.id,
      sessionId: sessionId || 'all',
      limit
    });

    // Query to get recent histories - we've confirmed serverClient is not null
    const supabase = serverClient;

    // Query to get recent histories - serverClient is guaranteed to be non-null here
    let query = supabase
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
        category: LOG_CATEGORIES.SYSTEM,
        error: messagesError,
        userId: user.id
      });

      return errorResponse('Failed to fetch chat histories', messagesError, 500);
    }

    // Get distinct sessions involved
    const sessionIds = [...new Set((messages as ChatMessage[])?.map(m => m.session_id) || [])];

    // Get session info for these sessions
    const { data: sessions } = await supabase
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at')
      .in('id', sessionIds);

    // Create session lookup map
    const sessionMap: SessionMap = {};
    (sessions as ChatSession[])?.forEach(s => {
      sessionMap[s.id] = s;
    });

    // Build response data
    return successResponse({
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
    edgeLogger.error('Error in debug/histories endpoint', {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });

    return errorResponse(
      'Debug check failed',
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

export async function POST(): Promise<Response> {
  return errorResponse('Method not implemented', null, 501);
} 