import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';
import type { IdParam } from '@/lib/types/route-handlers'; // Import IdParam for DELETE
import { historyService } from '@/lib/api/history-service'; // <-- Import historyService
import { LOG_CATEGORIES } from '@/lib/logger/constants'; // Import LOG_CATEGORIES if not already present

/**
 * History API Route
 * 
 * This route handler manages operations for the history sidebar:
 * - GET: Retrieves chat history for the authenticated user
 * - DELETE: Removes a specific chat from history
 */

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

// Define GET handler for retrieving user's chat history
const GET_Handler: AuthenticatedRouteHandler = async (request, context) => {
  const { user } = context;
  const operationId = `get_history_${Math.random().toString(36).substring(2, 10)}`;

  try {
    edgeLogger.info('Fetching chat history', { category: LOG_CATEGORIES.CHAT, userId: user.id.substring(0, 8), operationId });
    const supabase = await createRouteHandlerClient();
    // Use fetchHistory method
    const data = await historyService.fetchHistory(supabase);
    edgeLogger.info('Successfully fetched chat history', { category: LOG_CATEGORIES.CHAT, userId: user.id.substring(0, 8), operationId, count: data.length });
    return successResponse(data);
  } catch (error) {
    edgeLogger.error('Error fetching chat history', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: user.id.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
    return errorResponse('Failed to fetch chat history', error instanceof Error ? error : String(error), 500); // Ensure error type
  }
};

// Define DELETE handler for removing a chat from history
const DELETE_Handler: AuthenticatedRouteHandler = async (request, context) => {
  const { user } = context;
  const url = new URL(request.url);
  const chatId = url.searchParams.get('id');
  const operationId = `delete_history_${Math.random().toString(36).substring(2, 10)}`;

  if (!chatId) {
    return errorResponse('Chat ID query parameter is required', null, 400);
  }

  try {
    edgeLogger.info('Deleting chat history item', { category: LOG_CATEGORIES.CHAT, userId: user.id.substring(0, 8), chatId, operationId });
    const supabase = await createRouteHandlerClient();
    const success = await historyService.deleteChat(supabase, chatId);

    if (success) {
      edgeLogger.info('Successfully deleted chat history item', { category: LOG_CATEGORIES.CHAT, userId: user.id.substring(0, 8), chatId, operationId });
      return successResponse({ message: 'Chat deleted successfully' });
    } else {
      edgeLogger.error('History service failed to delete chat', { category: LOG_CATEGORIES.CHAT, userId: user.id.substring(0, 8), chatId, operationId, important: true });
      return errorResponse('Failed to delete chat via service', null, 500);
    }
  } catch (error) { // <-- Add catch block
    edgeLogger.error('Error deleting chat history item', {
      category: LOG_CATEGORIES.CHAT,
      operationId,
      userId: user.id.substring(0, 8),
      chatId,
      error: error instanceof Error ? error.message : String(error),
      important: true
    });
    return errorResponse('Failed to delete chat history', error instanceof Error ? error : String(error), 500); // Ensure error type
  }
};

// Export handlers with auth wrapper
export const GET = withAuth(GET_Handler);
export const DELETE = withAuth(DELETE_Handler);