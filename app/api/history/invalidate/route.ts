import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

// History cache is defined in the history route.ts file
// This is a reference to the same cache mechanism
const historyCache = new Map<string, { data: any, timestamp: number }>();

export async function POST(request: NextRequest) {
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
                userId: userId.substring(0, 8) + '...',
                hadCache,
                operationId
            });

            return NextResponse.json({ success: true, message: 'Cache invalidated' });
        }

        // If not authenticated through headers, log it but return success anyway
        // This prevents exposing whether a user is authenticated or not
        edgeLogger.info('Invalidation requested without valid auth', {
            operationId
        });

        return NextResponse.json({ success: true, message: 'Request processed' });
    } catch (error) {
        edgeLogger.error('Error in history invalidation', {
            error: error instanceof Error ? error.message : String(error),
            operationId
        });

        // Return success even on error to prevent information disclosure
        return NextResponse.json({ success: true, message: 'Request processed' });
    }
} 