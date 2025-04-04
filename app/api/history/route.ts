import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { type User } from '@supabase/supabase-js';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { clientCache } from '@/lib/cache/client-cache';

/**
 * History API Route
 * 
 * This route handler manages operations for the history sidebar:
 * - GET: Retrieves chat history for the authenticated user
 * - DELETE: Removes a specific chat from history
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Simple in-memory cache for the edge runtime
// Consider a more robust distributed cache (like Upstash/Redis) for production scale
const historyCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- GET Handler (Pattern B - Direct Export) ---
export async function GET(request: Request): Promise<Response> {
  const operationId = `get_hist_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Manual Auth Check
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      edgeLogger.warn('Authentication required for GET history', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        error: authError?.message
      });
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true);
    }
    const userId = user.id;

    edgeLogger.info('Fetching chat history for user', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: userId.substring(0, 8)
    });

    // Check cache first
    const cached = historyCache.get(userId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      edgeLogger.info('Returning cached history', {
        category: LOG_CATEGORIES.CACHE,
        operationId,
        userId: userId.substring(0, 8)
      });
      return handleCors(successResponse(cached.data), request, true);
    }

    // Fetch history from DB if not cached or expired
    const { data: history, error: dbError } = await supabase
      .from('sd_sessions')
      .select('session_id, title, updated_at') // Fetch only necessary fields
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50); // Limit history entries

    if (dbError) {
      edgeLogger.error('Error fetching history from DB', {
        category: LOG_CATEGORIES.DB,
        operationId,
        userId: userId.substring(0, 8),
        error: dbError.message
      });
      const errRes = errorResponse('Failed to fetch history', dbError);
      return handleCors(errRes, request, true);
    }

    // Format data (optional, depends on frontend needs)
    const formattedHistory = history?.map(h => ({
      id: h.session_id,
      title: h.title || 'Untitled Chat',
      lastUpdated: h.updated_at
    })) || [];

    // Update cache
    historyCache.set(userId, { data: formattedHistory, timestamp: Date.now() });

    edgeLogger.info('Successfully fetched and cached history', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: userId.substring(0, 8),
      count: formattedHistory.length
    });

    const response = successResponse(formattedHistory);
    return handleCors(response, request, true);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    edgeLogger.error('Unexpected error fetching history', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: errorMsg,
      important: true
    });
    const errRes = errorResponse('Unexpected error fetching history', error, 500);
    return handleCors(errRes, request, true);
  }
}

// --- DELETE Handler (Pattern B - Direct Export) ---
export async function DELETE(request: Request): Promise<Response> {
  const operationId = `delete_hist_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Manual Auth Check
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      edgeLogger.warn('Authentication required for DELETE history item', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        error: authError?.message
      });
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true);
    }
    const userId = user.id;

    // Extract chatId from query parameters
    const url = new URL(request.url);
    const chatId = url.searchParams.get('id');

    if (!chatId) {
      const errRes = validationError('Chat ID (id) query parameter is required for deletion');
      return handleCors(errRes, request, true);
    }

    edgeLogger.info('Attempting to delete chat session from history', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: userId.substring(0, 8),
      chatId: chatId.slice(0, 8)
    });

    // Delete the specific session (RLS enforced by user_id check)
    // Consider deleting related messages if necessary
    const { error: messagesError } = await supabase
      .from('sd_chat_histories')
      .delete()
      .eq('session_id', chatId)
      .eq('user_id', user.id);

    if (messagesError) {
      edgeLogger.error('Error deleting chat messages before session', { operationId, chatId: chatId.slice(0, 8), error: messagesError.message });
      return handleCors(errorResponse('Failed to delete associated messages', messagesError), request, true);
    }

    const { error: sessionError } = await supabase
      .from('sd_sessions')
      .delete()
      .eq('session_id', chatId)
      .eq('user_id', userId);

    if (sessionError) {
      edgeLogger.error('Error deleting session from DB', {
        category: LOG_CATEGORIES.DB,
        operationId,
        userId: userId.substring(0, 8),
        chatId: chatId.slice(0, 8),
        error: sessionError.message
      });
      const errRes = errorResponse('Failed to delete chat session', sessionError);
      return handleCors(errRes, request, true);
    }

    // Invalidate cache after successful deletion
    historyCache.delete(userId);
    clientCache.remove(`history_${userId}`); // Also invalidate client-side cache if used

    edgeLogger.info('Successfully deleted chat session and invalidated cache', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: userId.substring(0, 8),
      chatId: chatId.slice(0, 8)
    });

    const response = successResponse({ deleted: true, id: chatId });
    return handleCors(response, request, true);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    edgeLogger.error('Unexpected error deleting history item', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: errorMsg,
      important: true
    });
    const errRes = errorResponse('Unexpected error deleting history item', error, 500);
    return handleCors(errRes, request, true);
  }
}