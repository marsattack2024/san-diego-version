import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { withAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// LRU Cache for server-side history caching across requests
const historyCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds
const MAX_CACHE_ITEMS = 1000;

function getCachedHistory(userId: string) {
  const cacheKey = `history:${userId}`;
  const cachedItem = historyCache.get(cacheKey);

  if (cachedItem && (Date.now() - cachedItem.timestamp) < CACHE_TTL) {
    return cachedItem.data;
  }

  return null;
}

function setCachedHistory(userId: string, data: any) {
  const cacheKey = `history:${userId}`;

  // If cache is getting too large, remove oldest entries
  if (historyCache.size >= MAX_CACHE_ITEMS) {
    const entries = Array.from(historyCache.entries());
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    // Remove oldest 10% of entries
    const deleteCount = Math.ceil(MAX_CACHE_ITEMS * 0.1);
    entries.slice(0, deleteCount).forEach(([key]) => historyCache.delete(key));
  }

  historyCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

// Wrap the core logic in withAuth
export const GET = withAuth(async (user: User, request: Request): Promise<Response> => {
  const operationId = `hist_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // User is already authenticated by the wrapper
    const userId = user.id;

    edgeLogger.debug('History API request received', {
      userId: userId.substring(0, 8) + '...',
      operationId
    });

    // Use helper function to get history
    return await getHistoryForUser(userId, operationId);

  } catch (error) {
    // This catch block handles errors *outside* the getHistoryForUser helper
    edgeLogger.error('Error in history API GET wrapper', {
      error: error instanceof Error ? error.message : String(error),
      operationId,
      errorObject: error instanceof Error ? error.stack : null
    });

    return errorResponse('An error occurred', error, 500);
  }
});

// Helper function to get history for a valid user
async function getHistoryForUser(userId: string, operationId: string): Promise<Response> {
  try {
    // Check cache first for faster response
    const cachedResult = getCachedHistory(userId);
    if (cachedResult) {
      edgeLogger.debug('Returning cached history data', {
        userId: userId.substring(0, 8) + '...',
        operationId
      });

      const response = successResponse(cachedResult);

      // Set cache control headers - short TTL to allow freshness
      response.headers.set('Cache-Control', 'private, max-age=5');

      return response;
    }

    const supabase = await createRouteHandlerClient();

    // Fetch user's chat sessions with Supabase query (RLS handles authorization)
    const { data: sessions, error } = await supabase
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at, agent_id') // Removed user_id from select
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      edgeLogger.error('Error fetching chat sessions', {
        error,
        userId: userId.substring(0, 8) + '...',
        operationId
      });

      return errorResponse('Error fetching chat history', error, 500);
    }

    // Return formatted history data
    const chats = (sessions || []).map(session => ({
      id: session.id,
      title: session.title || 'New Chat',
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      userId: userId, // Already have the userId
      agentId: session.agent_id
    }));

    // Cache the results for future requests
    setCachedHistory(userId, chats);

    edgeLogger.info('Successfully fetched chat history', {
      count: chats.length,
      userId: userId.substring(0, 8) + '...',
      operationId
    });

    // Return array format directly as expected by the client
    const response = successResponse(chats);

    // Set cache control headers - short TTL to allow freshness
    response.headers.set('Cache-Control', 'private, max-age=5');

    return response;
  } catch (error) {
    edgeLogger.error('Error fetching history for user', {
      error: error instanceof Error ? error.message : String(error),
      userId: userId.substring(0, 8) + '...',
      operationId
    });

    return errorResponse('Server error', error, 500);
  }
}

// Handle chat deletion
export const DELETE = withAuth(async (user: User, request: Request): Promise<Response> => {
  const operationId = `del_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Get the chat ID from the URL
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      edgeLogger.warn('No chat ID provided for deletion', {
        operationId,
        userId: user.id.substring(0, 8)
      });
      return errorResponse('Chat ID is required', null, 400);
    }

    edgeLogger.info('Deleting chat', {
      category: 'chat',
      operationId,
      chatId: id,
      userId: user.id.substring(0, 8) + '...'
    });

    // Delete the chat session - RLS enforces ownership
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase
      .from('sd_chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Double check user_id for safety

    if (error) {
      edgeLogger.error('Error deleting chat', {
        error,
        chatId: id,
        userId: user.id,
        operationId
      });

      return errorResponse('Failed to delete chat', error, 500);
    }

    edgeLogger.info('Chat deleted successfully', {
      chatId: id,
      userId: user.id,
      operationId
    });

    // Invalidate cache for this user
    const cacheKey = `history:${user.id}`;
    historyCache.delete(cacheKey);

    return successResponse({ success: true });
  } catch (error) {
    edgeLogger.error('Error in delete chat API', {
      error: error instanceof Error ? error.message : String(error),
      operationId,
      errorObject: error instanceof Error ? error.stack : null
    });

    return errorResponse('An error occurred while deleting the chat', error, 500);
  }
});