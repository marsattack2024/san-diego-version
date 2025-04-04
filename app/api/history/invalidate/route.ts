import { type NextRequest } from 'next/server';
import { type User } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { clientCache } from '@/lib/cache/client-cache';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// History cache (simple in-memory for edge)
// Consider moving to a shared cache module if used elsewhere
const historyCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * POST handler to invalidate cached chat history for a user (Pattern B - Direct Export)
 */
export async function POST(request: Request): Promise<Response> {
    const operationId = `invalidate_hist_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Manual Auth Check
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for history invalidation', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                error: authError?.message
            });
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }
        const userId = user.id;

        edgeLogger.info('Invalidating history cache for user', {
            category: LOG_CATEGORIES.CACHE,
            operationId,
            userId: userId.substring(0, 8)
        });

        // Invalidate the cache for the specific user
        // This uses the simplified clientCache - adapt if using a different mechanism
        clientCache.remove(`history_${userId}`);
        // Also clear the local map cache used in history/route.ts if necessary
        // (This implies potential inconsistency if not using a shared cache store like Redis/Upstash)
        historyCache.delete(userId);

        edgeLogger.info('History cache invalidated successfully', {
            category: LOG_CATEGORIES.CACHE,
            operationId,
            userId: userId.substring(0, 8)
        });

        const response = successResponse({ message: 'History cache invalidated' });
        return handleCors(response, request, true);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        edgeLogger.error('Unexpected error invalidating history cache', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            error: errorMsg,
            important: true
        });
        const errRes = errorResponse('Unexpected error invalidating cache', error, 500);
        return handleCors(errRes, request, true);
    }
} 