import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import type { Message } from 'ai';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';
import { handleCors } from '@/lib/utils/http-utils';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET handler to retrieve paginated messages for a specific chat
 */
const GET_Handler: AuthenticatedRouteHandler = async (request: Request, context, user) => {
    const { params } = context;
    const chatId = params?.id;

    if (!chatId) {
        return errorResponse('Chat ID is required', null, 400);
    }

    const operationId = `messages_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Get pagination params
        const url = new URL(request.url);
        const { searchParams } = url;
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '100'); // Default to larger page size

        edgeLogger.info('Fetching messages', {
            operation: 'fetch_messages',
            operationId,
            chatId: chatId.slice(0, 8), // Only log partial ID for privacy
            userId: user.id.substring(0, 8),
            page,
            pageSize
        });

        if (isNaN(page) || page < 1) {
            return errorResponse('Invalid page number', null, 400);
        }

        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            return errorResponse('Invalid page size', null, 400);
        }

        // Create Supabase client
        const supabase = await createRouteHandlerClient();

        // Calculate offset for pagination
        const offset = (page - 1) * pageSize;

        // Query the database for the messages - RLS handles user auth
        const { data, error } = await supabase
            .from('sd_chat_histories')
            .select('*')
            .eq('session_id', chatId)
            .order('created_at', { ascending: true }) // Oldest first
            .range(offset, offset + pageSize - 1);

        if (error) {
            edgeLogger.error('Error fetching messages', {
                operation: 'fetch_messages',
                operationId,
                error: error.message,
                chatId: chatId.slice(0, 8),
                page,
                pageSize
            });

            return errorResponse('Failed to fetch messages', error);
        }

        // Transform database records to Message format
        const messages: Message[] = data.map((record: any) => ({
            id: record.id,
            role: record.role,
            content: record.content,
            createdAt: record.created_at,
            toolsUsed: record.tools_used
        }));

        // Log the result
        edgeLogger.info('Successfully fetched messages', {
            operation: 'fetch_messages',
            operationId,
            chatId: chatId.slice(0, 8),
            page,
            pageSize,
            count: messages.length
        });

        // Add DEBUG logging to check message content
        if (messages.length > 0) {
            edgeLogger.debug('Message sample', {
                operation: 'fetch_messages',
                operationId,
                firstMessageId: messages[0].id,
                messageCount: messages.length,
                firstMessageContent: messages[0].content.substring(0, 100) + '...'
            });
        }

        // Return success response with CORS headers
        const response = successResponse(messages);
        return handleCors(response, request, true);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        edgeLogger.error('Unexpected error fetching messages', {
            operation: 'fetch_messages',
            error: errorMsg
        });
        // Return error response with CORS headers
        const response = errorResponse('Unexpected error fetching messages', error, 500);
        return handleCors(response, request, true);
    }
};

// Apply withAuth wrapper
export const GET = withAuth(GET_Handler); 