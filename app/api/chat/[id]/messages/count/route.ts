import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';

export async function GET(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    try {
        const { id: chatId } = await params;

        // Basic validation
        if (!chatId) {
            return errorResponse('Chat ID is required', null, 400);
        }

        // Create Supabase client
        const supabase = await createRouteHandlerClient();

        // Get the current user from auth
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed counting messages', {
                operation: 'count_chat_messages',
                error: authError?.message || 'No user found'
            });

            return unauthorizedError();
        }

        // Log the request
        edgeLogger.info('Counting total chat messages', {
            operation: 'count_chat_messages',
            chatId: chatId.slice(0, 8), // Only log partial ID for privacy
            userId: user.id.slice(0, 8)
        });

        // Count the total messages for this chat
        const { count, error } = await supabase
            .from('sd_chat_histories')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', chatId);

        if (error) {
            edgeLogger.error('Error counting chat messages', {
                operation: 'count_chat_messages',
                error: error.message,
                chatId: chatId.slice(0, 8)
            });

            return errorResponse('Failed to count messages', error);
        }

        // Log the result
        edgeLogger.info('Successfully counted chat messages', {
            operation: 'count_chat_messages',
            chatId: chatId.slice(0, 8),
            count: count || 0
        });

        return successResponse({ count: count || 0 });
    } catch (error) {
        return errorResponse('Unexpected error counting chat messages', error);
    }
} 