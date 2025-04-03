import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';
import { handleCors } from '@/lib/utils/http-utils';
import { withAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET handler to count total messages for a specific chat
 */
export const GET = withAuth(async (user: User, request: Request): Promise<Response> => {
    const operationId = `count_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Retrieve chat ID from URL
        const url = new URL(request.url);
        const pathnameSegments = url.pathname.split('/');
        const chatId = pathnameSegments[pathnameSegments.length - 3]; // ID is third to last segment (api/chat/[id]/messages/count)

        // Basic validation
        if (!chatId) {
            return errorResponse('Chat ID is required', null, 400);
        }

        edgeLogger.info('Counting chat messages', {
            operation: 'count_chat_messages',
            operationId,
            chatId: chatId.slice(0, 8), // Only log partial ID for privacy
            userId: user.id.substring(0, 8)
        });

        // Create Supabase client
        const supabase = await createRouteHandlerClient();

        // Count the total messages for this chat (RLS handles auth)
        const { count, error } = await supabase
            .from('sd_chat_histories')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', chatId);

        if (error) {
            edgeLogger.error('Error counting chat messages', {
                operation: 'count_chat_messages',
                operationId,
                error: error.message,
                chatId: chatId.slice(0, 8)
            });

            return errorResponse('Failed to count messages', error);
        }

        // Log the result
        edgeLogger.info('Successfully counted chat messages', {
            operation: 'count_chat_messages',
            operationId,
            chatId: chatId.slice(0, 8),
            count: count || 0
        });

        // Return success response with CORS headers
        const response = successResponse({ count: count || 0 });
        return handleCors(response, request, true);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        edgeLogger.error('Unexpected error counting chat messages', {
            operation: 'count_chat_messages',
            error: errorMsg
        });
        // Return error response with CORS headers
        const response = errorResponse('Unexpected error counting chat messages', error, 500);
        return handleCors(response, request, true);
    }
}); 