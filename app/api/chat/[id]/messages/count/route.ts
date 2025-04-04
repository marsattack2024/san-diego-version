import { type NextRequest } from 'next/server';
import { type User } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';
import { handleCors } from '@/lib/utils/http-utils';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET handler to count total messages for a specific chat
 */
const GET_Handler: AuthenticatedRouteHandler = async (request: Request, context) => {
    const { user } = context;
    let chatId;

    if (context.params) {
        // Must await params in Next.js 15
        const resolvedParams = await context.params;
        chatId = resolvedParams.id;
    }

    if (!chatId) {
        return handleCors(errorResponse('Chat ID is required', null, 400), request, true);
    }

    const operationId = `count_${Math.random().toString(36).substring(2, 10)}`;

    try {
        edgeLogger.info('Counting chat messages', {
            operation: 'count_chat_messages',
            operationId,
            chatId: chatId.slice(0, 8),
            userId: user.id.substring(0, 8)
        });

        const supabase = await createRouteHandlerClient();

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

            return handleCors(errorResponse('Failed to count messages', error), request, true);
        }

        edgeLogger.info('Successfully counted chat messages', {
            operation: 'count_chat_messages',
            operationId,
            chatId: chatId.slice(0, 8),
            count: count || 0
        });

        const response = successResponse({ count: count || 0 });
        return handleCors(response, request, true);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        edgeLogger.error('Unexpected error counting chat messages', {
            operation: 'count_chat_messages',
            error: errorMsg
        });
        const response = errorResponse('Unexpected error counting chat messages', error, 500);
        return handleCors(response, request, true);
    }
};

export const GET = withAuth(GET_Handler); 