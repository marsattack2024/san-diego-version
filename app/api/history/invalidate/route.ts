import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { withAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';

// History cache is defined in the history route.ts file
// This is a reference to the same cache mechanism
const historyCache = new Map<string, { data: any, timestamp: number }>();

export const POST = withAuth(async (user: User, request: Request): Promise<Response> => {
    const operationId = `invalidate_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // User is already authenticated by the wrapper
        const userId = user.id;

        // Clear cache for this specific user
        const cacheKey = `history:${userId}`;
        const hadCache = historyCache.has(cacheKey);
        historyCache.delete(cacheKey);

        edgeLogger.info('History cache invalidated for user', {
            category: LOG_CATEGORIES.SYSTEM,
            userId: userId.substring(0, 8) + '...',
            hadCache,
            operationId
        });

        return successResponse({
            success: true,
            message: 'Cache invalidated'
        });

    } catch (error) {
        edgeLogger.error('Error in history invalidation', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error),
            operationId
        });

        // Return error response
        return errorResponse('Server error during cache invalidation', error, 500);
    }
}); 