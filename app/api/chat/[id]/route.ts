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
import { withAuth } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// GET handler to retrieve a specific chat and its messages
export const GET = withAuth(async (user: User, request: Request): Promise<Response> => {
    const operationId = `get_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Retrieve params from the request URL within the handler
        const url = new URL(request.url);
        const pathnameSegments = url.pathname.split('/');
        const chatId = pathnameSegments[pathnameSegments.length - 1]; // Assuming ID is the last segment

        if (!chatId) {
            return errorResponse('Missing chat ID', null, 400);
        }

        edgeLogger.info('Chat GET request started', {
            category: 'chat',
            operationId,
            chatId
        });

        // Authentication handled by wrapper, user object is passed
        edgeLogger.info('User authenticated (via withAuth)', {
            category: 'auth',
            operationId,
            userId: user.id.substring(0, 8)
        });

        // Get chat session data
        const supabase = await createRouteHandlerClient(); // Need to create client here
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

        // RLS should handle authorization, but double-check ownership for safety
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
        // In the catch block, log error without relying on potentially unresolved params
        edgeLogger.error('Unexpected error getting chat', {
            category: 'chat',
            operationId: `get_chat_error_${Math.random().toString(36).substring(2, 10)}`,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        const errorResp = errorResponse('Server error', error instanceof Error ? error.message : String(error), 500);
        return handleCors(errorResp, request, true);
    }
});

// PATCH handler to update chat metadata
export const PATCH = withAuth(async (user: User, request: Request): Promise<Response> => {
    const operationId = `patch_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Retrieve params from the request URL within the handler
        const url = new URL(request.url);
        const pathnameSegments = url.pathname.split('/');
        const chatId = pathnameSegments[pathnameSegments.length - 1];

        if (!chatId) {
            return errorResponse('Missing chat ID', null, 400);
        }

        // Parse request body
        const body = await request.json();
        const { title } = body;

        if (!title || typeof title !== 'string') {
            return errorResponse('Invalid title provided', null, 400);
        }

        edgeLogger.info('Chat PATCH request started', {
            category: 'chat',
            operationId,
            chatId,
            userId: user.id.substring(0, 8),
            newTitle: title
        });

        const supabase = await createRouteHandlerClient();

        // Verify chat exists and belongs to user (using RLS indirectly)
        const { data: existingChat, error: fetchError } = await supabase
            .from('sd_chat_sessions')
            .select('id, user_id') // Only select needed fields
            .eq('id', chatId)
            .single();

        if (fetchError || !existingChat) {
            edgeLogger.error('Error finding chat to update or chat not found', {
                category: 'chat',
                operationId,
                chatId,
                error: fetchError?.message || 'Chat not found'
            });
            return handleCors(notFoundError('Chat not found or access denied'), request, true);
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
            .update({ title: title.trim() })
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

        // Return updated chat metadata
        const successResp = successResponse({ id: chatId, title: title.trim() });
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
});
