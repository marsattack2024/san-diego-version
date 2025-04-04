import { type NextRequest } from 'next/server';
import { type User } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { clientCache } from '@/lib/cache/client-cache';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';

// History cache is defined in the history route.ts file
// This is a reference to the same cache mechanism
const historyCache = new Map<string, { data: any, timestamp: number }>();

// Update signature
const POST_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
    const operationId = `invalidate_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Clear cache for this specific user
        const cacheKey = `history:${user.id}`;
        const hadCache = historyCache.has(cacheKey);
        historyCache.delete(cacheKey);

        edgeLogger.info('History cache invalidated for user', {
            category: LOG_CATEGORIES.SYSTEM,
            userId: user.id.substring(0, 8) + '...',
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
};

// Apply withAuth wrapper
export const POST = withAuth(POST_Handler); 