/**
 * Chat ID API Route
 * 
 * This route handler manages operations for specific chat sessions by ID:
 * - GET: Retrieves a specific chat including its messages
 * - PATCH: Updates chat metadata (like title)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError, notFoundError } from '@/lib/utils/route-handler';
import type { IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// GET handler to retrieve a specific chat and its messages
export async function GET(
    req: Request,
    { params }: IdParam
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
        const supabase = await createClient();
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
    { params }: IdParam
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
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed updating chat', {
                category: 'auth',
                operationId,
                error: authError?.message || 'No user found'
            });

            return unauthorizedError();
        }

        // Verify the chat exists and belongs to this user
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('id, user_id')
            .eq('id', chatId)
            .single();

        if (sessionError || !sessionData) {
            edgeLogger.error('Error fetching chat session for update', {
                category: 'chat',
                operationId,
                chatId,
                error: sessionError?.message || 'Session not found',
                important: true
            });

            return notFoundError('Chat not found');
        }

        // Verify ownership
        if (sessionData.user_id !== user.id) {
            edgeLogger.warn('User attempted to update chat they do not own', {
                category: 'auth',
                operationId,
                userId: user.id,
                chatUserId: sessionData.user_id
            });

            return errorResponse('Unauthorized - you do not have access to this chat', null, 403);
        }

        // Extract properties to update
        const updateData: Record<string, any> = {};

        // Check for valid title update
        if (body.title !== undefined) {
            if (typeof body.title !== 'string') {
                return errorResponse('Invalid title format', null, 400);
            }
            updateData.title = body.title.trim();
        }

        // Check for agent_id update
        if (body.agentId !== undefined) {
            if (typeof body.agentId !== 'string') {
                return errorResponse('Invalid agent ID format', null, 400);
            }
            updateData.agent_id = body.agentId;
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return errorResponse('No valid fields to update', null, 400);
        }

        // Set updated_at timestamp
        updateData.updated_at = new Date().toISOString();

        // Update the chat session
        const { error: updateError } = await supabase
            .from('sd_chat_sessions')
            .update(updateData)
            .eq('id', chatId);

        if (updateError) {
            edgeLogger.error('Error updating chat', {
                category: 'chat',
                operationId,
                chatId,
                error: updateError.message,
                important: true
            });

            return errorResponse('Error updating chat', updateError);
        }

        edgeLogger.info('Successfully updated chat', {
            category: 'chat',
            operationId,
            chatId,
            fields: Object.keys(updateData).join(', ')
        });

        return successResponse({ success: true });

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