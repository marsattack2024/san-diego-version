import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import type { IdParam } from '@/lib/types/route-handlers'; // Use specific type for params
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET handler to count total messages for a specific chat (using Pattern B - Direct Export)
 */
export async function GET(
    request: Request,
    { params }: IdParam // Use specific type and destructure params promise
): Promise<Response> {
    const operationId = `count_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Manually create client and check auth
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for chat message count', {
                category: LOG_CATEGORIES.AUTH, // Added category
                operation: 'count_chat_messages',
                operationId,
                error: authError?.message || 'No authenticated user',
            });
            // Use standard unauthorizedError + handleCors
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }

        // Await params *after* auth check
        const resolvedParams = await params; // Await the destructured params promise
        const chatId = resolvedParams.id;

        // Validate chatId after resolution
        if (!chatId) {
            const errRes = validationError('Chat ID is required');
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Counting chat messages', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'count_chat_messages',
            operationId,
            chatId: chatId.slice(0, 8),
            userId: user.id.substring(0, 8)
        });

        // Perform DB query (assuming RLS)
        const { count, error } = await supabase
            .from('sd_chat_histories')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', chatId);

        if (error) {
            edgeLogger.error('Error counting chat messages', {
                category: LOG_CATEGORIES.DB,
                operation: 'count_chat_messages',
                operationId,
                error: error.message,
                chatId: chatId.slice(0, 8)
            });
            // Use standard errorResponse + handleCors
            const errRes = errorResponse('Failed to count messages', error);
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Successfully counted chat messages', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'count_chat_messages',
            operationId,
            chatId: chatId.slice(0, 8),
            count: count || 0
        });

        // Use standard successResponse + handleCors
        const response = successResponse({ count: count || 0 });
        return handleCors(response, request, true);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        edgeLogger.error('Unexpected error counting chat messages', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: 'count_chat_messages',
            operationId,
            error: errorMsg
        });
        // Use standard errorResponse + handleCors
        const errRes = errorResponse('Unexpected error counting chat messages', error, 500);
        return handleCors(errRes, request, true);
    }
} 