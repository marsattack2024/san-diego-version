import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

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

export async function GET(request: Request): Promise<Response> {
  // Generate a unique request ID for tracing
  const operationId = `hist_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Get auth headers from request with explicit logging
    const headersList = request.headers;
    const userId = headersList.get('x-supabase-auth');
    const isAuthValid = headersList.get('x-auth-valid') === 'true';
    const hasAuthCookies = headersList.get('x-has-auth-cookies') === 'true';

    // Sample logging for debugging (reduced to 2% of requests to minimize noise)
    if (Math.random() < 0.02) {
      edgeLogger.debug('History API received auth headers', {
        userId: userId || 'missing',
        isAuthValid: isAuthValid ? 'true' : 'false',
        authTime: headersList.get('x-auth-time') || 'missing',
        hasProfile: headersList.get('x-has-profile') || 'missing',
        hasAuthCookies: hasAuthCookies ? 'true' : 'false',
        headersSample: Array.from(headersList.entries())
          .filter(([key]) => key.startsWith('x-'))
          .map(([key, value]) => `${key}:${value.substring(0, 20)}`)
          .join(', '),
        operationId
      });
    }

    // Check for timestamp in URL parameters
    // Many 401 errors happen when clients don't include a timestamp
    const { searchParams } = new URL(request.url);
    const timestampParam = searchParams.get('t');
    const hasTimestamp = !!timestampParam;

    // Approach 1: Try auth from middleware headers first if they're valid
    if (userId && userId !== 'anonymous' && isAuthValid) {
      // Log this case for debugging at low frequency
      if (Math.random() < 0.05) {
        edgeLogger.debug('History API using middleware auth headers', {
          userId: userId.substring(0, 8) + '...',
          operationId
        });
      }

      // Use the user ID from headers to fetch history
      return await getHistoryForUser(userId, operationId);
    }

    // Approach 2: Fall back to direct Supabase auth if headers aren't valid
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      edgeLogger.error('Error authenticating user', {
        error: authError.message,
        operationId
      });
    }

    if (user) {
      // Log when header auth failed but direct auth succeeded (important for debugging)
      edgeLogger.info('History API using direct auth - headers not working', {
        userId: user.id.substring(0, 8) + '...',
        hadHeaders: !!userId,
        headerValue: userId || 'none',
        operationId
      });

      return await getHistoryForUser(user.id, operationId);
    }

    // Both auth methods failed - user is not authenticated

    // Special case: If request has auth cookies but failed auth, it's likely a timing issue
    // In this case, we return a special error code (409 Conflict) to signal client retry
    if (hasAuthCookies && hasTimestamp) {
      const response = errorResponse(
        'Authentication pending - cookies present but authentication incomplete',
        {
          error: 'AuthenticationPending',
          retryAfter: '1'
        },
        409
      );

      // Add special headers to help client detect authentication in progress
      response.headers.set('Retry-After', '1'); // Suggest 1 second retry
      response.headers.set('x-auth-pending', 'true');

      if (Math.random() < 0.1) { // Log only 10% of these
        edgeLogger.info('Authentication pending - cookies present but auth incomplete', {
          operationId,
          hasTimestamp
        });
      }

      return response;
    }

    // For standard 401 cases, add response tracking headers
    // Avoid logging every unauthorized request to reduce noise
    // Only log if we're not seeing a burst of unauthorized requests
    // We use the request count header to track bursts
    const unauthorizedRequestCount = parseInt(
      request.headers.get('x-unauthorized-count') || '0'
    );

    // Count this in the response headers to help client track them
    const newUnauthorizedCount = unauthorizedRequestCount + 1;

    // Only log if this isn't part of a burst of unauthorized requests
    if (newUnauthorizedCount <= 3 || newUnauthorizedCount % 10 === 0) {
      if (newUnauthorizedCount > 5) {
        edgeLogger.warn(`User not authenticated when fetching history (repeated ${newUnauthorizedCount} times)`, {
          operationId,
          hasTimestamp,
          hasAuthCookies
        });
      } else {
        edgeLogger.warn('User not authenticated when fetching history', {
          operationId,
          hasTimestamp,
          hasAuthCookies
        });
      }
    }

    // Return 401 with special headers to help client detect bursts
    const message = hasAuthCookies
      ? 'Auth cookies present but validation failed'
      : 'No valid authentication';

    const response = unauthorizedError(message);

    // Add headers to help client track unauthorized request bursts
    response.headers.set('x-unauthorized-count', newUnauthorizedCount.toString());
    response.headers.set('x-unauthorized-timestamp', Date.now().toString());

    return response;
  } catch (error) {
    // Get auth headers for debugging
    const headers = request.headers;
    edgeLogger.error('Error in history API', {
      error: error instanceof Error ? error.message : String(error),
      userId: headers.get('x-supabase-auth') || 'unknown',
      operationId,
      errorObject: error instanceof Error ? error.stack : null
    });

    return errorResponse('An error occurred', error, 500);
  }
}

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

    // Fetch user's chat sessions with Supabase query
    const { data: sessions, error } = await supabase
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at, agent_id')
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
      userId: userId,
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
export async function DELETE(request: Request): Promise<Response> {
  const operationId = `del_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Direct authentication using Supabase
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      edgeLogger.error('Error authenticating user', {
        error: authError.message,
        operationId
      });
    }

    if (!user) {
      edgeLogger.warn('User not authenticated when deleting chat', { operationId });
      return unauthorizedError('Authentication required to delete chat');
    }

    // Get the chat ID from the URL
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      edgeLogger.warn('No chat ID provided for deletion', { operationId });
      return errorResponse('Chat ID is required', null, 400);
    }

    // Delete the chat session
    const { error } = await supabase
      .from('sd_chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Ensure user can only delete their own chats

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
}