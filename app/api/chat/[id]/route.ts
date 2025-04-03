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

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// GET handler to retrieve a specific chat and its messages
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
): Promise<Response> {
    const operationId = `get_chat_${Math.random().toString(36).substring(2, 10)}`;
    const { id: chatId } = await params;

    edgeLogger.info('Chat GET request started', {
        category: 'chat',
        operationId,
        chatId
    });

    try {
        // Authenticate user
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed getting chat', {
                category: 'auth',
                operationId,
                error: authError?.message || 'No user found'
            });

            return unauthorizedError();
        }

        // Get chat session data
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('id, title, created_at, updated_at, agent_id, user_id')
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

            return notFoundError('Chat not found');
        }

        // Verify that the authenticated user owns this chat
        if (sessionData.user_id !== user.id) {
            edgeLogger.warn('User attempted to access chat they do not own', {
                category: 'auth',
                operationId,
                userId: user.id,
                chatUserId: sessionData.user_id
            });

            return errorResponse('Unauthorized - you do not have access to this chat', null, 403);
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

            return errorResponse('Error fetching chat messages', messagesError);
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

        return successResponse(response);

    } catch (error) {
        edgeLogger.error('Unexpected error getting chat', {
            category: 'chat',
            operationId,
            chatId,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        return errorResponse('Server error', error);
    }
}

// PATCH handler to update chat metadata
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
): Promise<Response> {
    const operationId = `patch_chat_${Math.random().toString(36).substring(2, 10)}`;
    const { id: chatId } = await params;

    edgeLogger.info('Chat PATCH request started', {
        category: 'chat',
        operationId,
        chatId
    });

    try {
        // Parse request body
        let body;
        try {
            body = await request.json();
        } catch (error) {
            edgeLogger.error('Failed to parse request JSON', {
                category: 'chat',
                operationId,
                error: error instanceof Error ? error.message : String(error),
                important: true
            });

            return errorResponse('Invalid JSON: Failed to parse request body', error, 400);
        }

        // Authenticate user
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed updating chat', {
                category: 'auth',
                operationId,
                error: authError?.message || 'No user found'
            });

            return unauthorizedError();
        }

        // Verify chat exists and user has access
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('user_id')
            .eq('id', chatId)
            .single();

        if (sessionError || !sessionData) {
            edgeLogger.error('Chat not found', {
                category: 'chat',
                operationId,
                chatId,
                error: sessionError?.message
            });

            return notFoundError('Chat not found');
        }

        // Verify ownership
        if (sessionData.user_id !== user.id) {
            edgeLogger.warn('User attempted to update chat they do not own', {
                category: 'auth',
                operationId,
                userId: user.id,
                chatId
            });

            return errorResponse('Unauthorized - you do not have access to this chat', null, 403);
        }

        // Perform the update
        const allowedUpdates = ['title'];
        const updates: Record<string, any> = {};
        let updateCount = 0;

        for (const key of allowedUpdates) {
            if (key in body) {
                updates[key] = body[key];
                updateCount++;
            }
        }

        if (updateCount === 0) {
            edgeLogger.warn('No valid fields to update', {
                category: 'chat',
                operationId,
                chatId,
                providedFields: Object.keys(body)
            });

            return errorResponse('No valid fields to update', null, 400);
        }

        // Add updated_at timestamp
        updates.updated_at = new Date().toISOString();

        // Update the chat session
        const { data, error: updateError } = await supabase
            .from('sd_chat_sessions')
            .update(updates)
            .eq('id', chatId)
            .select()
            .single();

        if (updateError) {
            edgeLogger.error('Error updating chat', {
                category: 'chat',
                operationId,
                chatId,
                error: updateError.message,
                important: true
            });

            return errorResponse('Error updating chat', updateError, 500);
        }

        edgeLogger.info('Chat updated successfully', {
            category: 'chat',
            operationId,
            chatId,
            updatedFields: Object.keys(updates)
        });

        return successResponse(data);
    } catch (error) {
        edgeLogger.error('Unexpected error updating chat', {
            category: 'chat',
            operationId,
            chatId,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        return errorResponse('Server error', error);
    }
}