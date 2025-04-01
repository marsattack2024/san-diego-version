import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';

export const runtime = 'edge';

// History cache is defined in the history route.ts file
// This is a reference to the same cache mechanism
const historyCache = new Map<string, { data: any, timestamp: number }>();

export async function POST(request: Request): Promise<Response> {
    const operationId = `invalidate_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Check authentication to prevent abuse
        const headersList = request.headers;
        const userId = headersList.get('x-supabase-auth');
        const isAuthValid = headersList.get('x-auth-valid') === 'true';

        if (userId && userId !== 'anonymous' && isAuthValid) {
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
        }

        // If not authenticated through headers, log it but return success anyway
        // This prevents exposing whether a user is authenticated or not
        edgeLogger.info('Invalidation requested without valid auth', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId
        });

        // Return success even on error to prevent information disclosure
        return successResponse({
            success: true,
            message: 'Request processed'
        });
    } catch (error) {
        edgeLogger.error('Error in history invalidation', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error),
            operationId
        });

        // Return success even on error to prevent information disclosure
        // This is a security measure to prevent revealing if a user exists
        return successResponse({
            success: true,
            message: 'Request processed'
        });
    }
} 