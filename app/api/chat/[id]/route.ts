/**
 * Chat ID API Route
 * 
 * This route handler manages operations for specific chat sessions by ID:
 * - GET: Retrieves a specific chat including its messages
 * - PATCH: Updates chat metadata (like title)
 */

import { successResponse, errorResponse, unauthorizedError, notFoundError } from '@/lib/utils/route-handler';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { handleCors } from '@/lib/utils/http-utils';
import type { IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// GET handler to retrieve a specific chat and its messages
export async function GET(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    const operationId = `get_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Extract params safely by awaiting the Promise
        const { id: chatId } = await params;

        edgeLogger.info('Chat GET request started', {
            category: 'chat',
            operationId,
            chatId
        });

        // Authenticate user
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed getting chat', {
                category: 'auth',
                operationId,
                error: authError?.message || 'No user found'
            });

            return handleCors(unauthorizedError(), request, true);
        }

        // Get chat session data
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('id, title, created_at, updated_at, agent_id, user_id, deep_search_enabled')
            .eq('id', chatId)
            .single();

        if (sessionError || !sessionData) {
            edgeLogger.error('Error fetching chat session', {
                category: 'chat',
                operationId,
                chatId,
                error: sessionError?.message || 'Session not found',
                important: true
            });

            return handleCors(notFoundError('Chat not found'), request, true);
        }

        // Verify that the authenticated user owns this chat
        if (sessionData.user_id !== user.id) {
            edgeLogger.warn('User attempted to access chat they do not own', {
                category: 'auth',
                operationId,
                userId: user.id,
                chatUserId: sessionData.user_id
            });

            const response = errorResponse('Unauthorized - you do not have access to this chat', null, 403);
            return handleCors(response, request, true);
        }

        // Get chat messages
        const { data: messagesData, error: messagesError } = await supabase
            .from('sd_chat_histories')
            .select('id, content, role, created_at, tools_used')
            .eq('session_id', chatId)
            .order('created_at', { ascending: true });

        if (messagesError) {
            edgeLogger.error('Error fetching chat messages', {
                category: 'chat',
                operationId,
                chatId,
                error: messagesError.message,
                important: true
            });

            const response = errorResponse('Error fetching chat messages', messagesError);
            return handleCors(response, request, true);
        }

        // Format messages for client
        const messages = messagesData.map(msg => ({
            id: msg.id,
            content: msg.content,
            role: msg.role,
            createdAt: msg.created_at,
            toolsUsed: msg.tools_used
        }));

        // Construct response
        const response = {
            id: sessionData.id,
            title: sessionData.title || 'New Chat',
            createdAt: sessionData.created_at,
            updatedAt: sessionData.updated_at,
            agentId: sessionData.agent_id,
            deepSearchEnabled: sessionData.deep_search_enabled || false,
            messages
        };

        edgeLogger.info('Successfully retrieved chat data', {
            category: 'chat',
            operationId,
            chatId,
            messageCount: messages.length
        });

        // --- BEGIN DEBUG LOGGING ---
        edgeLogger.debug('[API GET /chat/[id]] Raw messagesData from DB:', {
            category: 'chat',
            operationId,
            chatId,
            count: messagesData?.length,
            sample: JSON.stringify(messagesData?.slice(0, 2)) // Log first 2 raw messages
        });
        edgeLogger.debug('[API GET /chat/[id]] Formatted messages array:', {
            category: 'chat',
            operationId,
            chatId,
            count: messages?.length,
            sample: JSON.stringify(messages?.slice(0, 2)) // Log first 2 formatted messages
        });
        edgeLogger.debug('[API GET /chat/[id]] Full response object being returned:', {
            category: 'chat',
            operationId,
            chatId,
            responseKeys: Object.keys(response),
            messageCountInResponse: response.messages?.length
        });
        // --- END DEBUG LOGGING ---

        const successResp = successResponse(response);
        return handleCors(successResp, request, true);

    } catch (error) {
        // In the catch block, we need to be careful with params which might be a Promise
        let chatIdForLogging = 'unknown';
        try {
            chatIdForLogging = params ? (await params).id : 'unknown';
        } catch {
            // Ignore any errors accessing params
        }

        edgeLogger.error('Unexpected error getting chat', {
            category: 'chat',
            operationId: `get_chat_error_${Math.random().toString(36).substring(2, 10)}`,
            chatId: chatIdForLogging,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        const errorResp = errorResponse('Server error', error, 500);
        return handleCors(errorResp, request, true);
    }
}

// PATCH handler to update chat metadata
