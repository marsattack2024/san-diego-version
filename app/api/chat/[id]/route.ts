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
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// GET handler to retrieve a specific chat and its messages
const GET_Handler: AuthenticatedRouteHandler = async (request: Request, context, user) => {
    const { params } = context;
    const chatId = params?.id;

    if (!chatId) {
        return errorResponse('Chat ID is required', null, 400);
    }

    const operationId = `get_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        edgeLogger.info('Chat GET request started', {
            category: 'chat',
            operationId,
            chatId
        });

        edgeLogger.info('User authenticated (via withAuth)', {
            category: 'auth',
            operationId,
            userId: user.id.substring(0, 8)
        });

        const supabase = await createRouteHandlerClient();
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

        const messages = messagesData.map(msg => ({
            id: msg.id,
            content: msg.content,
            role: msg.role,
            createdAt: msg.created_at,
            toolsUsed: msg.tools_used
        }));

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

        edgeLogger.debug('[API GET /chat/[id]] Raw messagesData from DB:', {
            category: 'chat',
            operationId,
            chatId,
            count: messagesData?.length,
            sample: JSON.stringify(messagesData?.slice(0, 2))
        });
        edgeLogger.debug('[API GET /chat/[id]] Formatted messages array:', {
            category: 'chat',
            operationId,
            chatId,
            count: messages?.length,
            sample: JSON.stringify(messages?.slice(0, 2))
        });
        edgeLogger.debug('[API GET /chat/[id]] Full response object being returned:', {
            category: 'chat',
            operationId,
            chatId,
            responseKeys: Object.keys(response),
            messageCountInResponse: response.messages?.length
        });

        const successResp = successResponse(response);
        return handleCors(successResp, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error getting chat', {
            category: 'chat',
            operationId: `get_chat_error_${Math.random().toString(36).substring(2, 10)}`,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        const errorResp = errorResponse('Server error', error instanceof Error ? error.message : String(error), 500);
        return handleCors(errorResp, request, true);
    }
};
export const GET = withAuth(GET_Handler);

// PATCH handler to update chat metadata
const PATCH_Handler: AuthenticatedRouteHandler = async (request: Request, context, user) => {
    const { params } = context;
    const chatId = params?.id;
    const operationId = `patch_chat_${Math.random().toString(36).substring(2, 10)}`;

    if (!chatId) {
        return handleCors(errorResponse('Chat ID is required', null, 400), request, true);
    }

    try {
        // Parse request body first
        let title: string;
        try {
            const body = await request.json();
            if (!body.title || typeof body.title !== 'string') {
                return handleCors(errorResponse('Invalid or missing title in request body', null, 400), request, true);
            }
            title = body.title.trim();
            if (!title) {
                return handleCors(errorResponse('Title cannot be empty', null, 400), request, true);
            }
        } catch (parseError: unknown) {
            const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
            edgeLogger.error('Error parsing PATCH body', { operationId, chatId, error: errorMessage });
            return handleCors(errorResponse('Invalid request body', errorMessage, 400), request, true);
        }

        edgeLogger.info('Chat PATCH request started', {
            category: 'chat',
            operationId,
            chatId,
            userId: user.id.substring(0, 8),
            newTitle: title // Log the validated title
        });

        const supabase = await createRouteHandlerClient();

        // Verify chat exists and belongs to user (using RLS indirectly is okay, but explicit check adds safety)
        const { data: existingChat, error: fetchError } = await supabase
            .from('sd_chat_sessions')
            .select('user_id')
            .eq('id', chatId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') { // Not found code
                return handleCors(notFoundError('Chat not found'), request, true);
            }
            edgeLogger.error('Error fetching chat for PATCH', { operationId, chatId, error: fetchError });
            return handleCors(errorResponse('Failed to fetch chat', fetchError), request, true);
        }

        if (!existingChat) { // Should be caught by fetchError, but belt-and-suspenders
            return handleCors(notFoundError('Chat not found'), request, true);
        }

        // Double check ownership before updating
        if (existingChat.user_id !== user.id) {
            edgeLogger.warn('Attempt to update chat owned by another user', {
                category: 'auth',
                operationId,
                chatId,
                userId: user.id,
                ownerId: existingChat.user_id
            });
            return handleCors(unauthorizedError('Not authorized to update this chat'), request, true);
        }

        // Update chat title
        const { error: updateError } = await supabase
            .from('sd_chat_sessions')
            .update({ title: title /* Use validated title */ })
            .eq('id', chatId);

        if (updateError) {
            edgeLogger.error('Error updating chat title', {
                category: 'chat',
                operationId,
                chatId,
                error: updateError.message,
                important: true
            });
            return handleCors(errorResponse('Failed to update chat', updateError), request, true);
        }

        edgeLogger.info('Successfully updated chat title', {
            category: 'chat',
            operationId,
            chatId
        });

        const successResp = successResponse({ id: chatId, title: title });
        return handleCors(successResp, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error updating chat', {
            category: 'chat',
            operationId: `patch_chat_error_${Math.random().toString(36).substring(2, 10)}`,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        const errorResp = errorResponse('Server error', error instanceof Error ? error.message : String(error), 500);
        return handleCors(errorResp, request, true);
    }
};
export const PATCH = withAuth(PATCH_Handler);

// --- DELETE Handler --- 
const DELETE_Handler: AuthenticatedRouteHandler = async (request: Request, context, user) => {
    const { params } = context;
    const chatId = params?.id;
    const operationId = `delete_chat_${Math.random().toString(36).substring(2, 10)}`;

    if (!chatId) {
        return handleCors(errorResponse('Chat ID is required', null, 400), request, true);
    }

    try {
        edgeLogger.info('Chat DELETE request started', {
            category: 'chat',
            operationId,
            chatId,
            userId: user.id.substring(0, 8)
        });

        const supabase = await createRouteHandlerClient();

        // Delete chat - RLS policy `auth.uid() = user_id` must exist on sd_chat_sessions for DELETE
        const { error } = await supabase
            .from('sd_chat_sessions')
            .delete()
            .eq('id', chatId);

        if (error) {
            // Log error but consider potential RLS failure as unauthorized vs server error
            edgeLogger.error('Error deleting chat', {
                category: 'chat',
                operationId,
                chatId,
                error: error.message,
                code: error.code,
                important: true
            });
            // Check for specific foreign key errors if needed, otherwise assume RLS or other DB issue
            return handleCors(errorResponse('Failed to delete chat', error), request, true);
        }

        edgeLogger.info('Successfully deleted chat', {
            category: 'chat',
            operationId,
            chatId
        });

        const successResp = successResponse({ message: 'Chat deleted successfully' });
        return handleCors(successResp, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error deleting chat', {
            category: 'chat',
            operationId: `delete_chat_error_${Math.random().toString(36).substring(2, 10)}`,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        const errorResp = errorResponse('Server error', error instanceof Error ? error : String(error), 500);
        return handleCors(errorResp, request, true);
    }
};
export const DELETE = withAuth(DELETE_Handler);
