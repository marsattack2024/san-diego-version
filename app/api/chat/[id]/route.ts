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

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// GET handler to retrieve a specific chat and its messages
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const operationId = `get_chat_${Math.random().toString(36).substring(2, 10)}`;
    const chatId = params.id;

    edgeLogger.info('Chat GET request started', {
        chatId,
        operationId
    });

    try {
        // Authenticate user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed getting chat', {
                operationId,
                error: authError?.message || 'No user found'
            });

            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get chat session data
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('id, title, created_at, updated_at, agent_id, user_id')
            .eq('id', chatId)
            .single();

        if (sessionError || !sessionData) {
            edgeLogger.error('Error fetching chat session', {
                operationId,
                chatId,
                error: sessionError?.message || 'Session not found'
            });

            return NextResponse.json(
                { error: 'Chat not found' },
                { status: 404 }
            );
        }

        // Verify that the authenticated user owns this chat
        if (sessionData.user_id !== user.id) {
            edgeLogger.warn('User attempted to access chat they do not own', {
                operationId,
                userId: user.id,
                chatUserId: sessionData.user_id
            });

            return NextResponse.json(
                { error: 'Unauthorized - you do not have access to this chat' },
                { status: 403 }
            );
        }

        // Get chat messages
        const { data: messagesData, error: messagesError } = await supabase
            .from('sd_chat_histories')
            .select('id, content, role, created_at, parent_message_id, tools_used')
            .eq('session_id', chatId)
            .order('created_at', { ascending: true });

        if (messagesError) {
            edgeLogger.error('Error fetching chat messages', {
                operationId,
                chatId,
                error: messagesError.message
            });

            return NextResponse.json(
                { error: 'Error fetching chat messages' },
                { status: 500 }
            );
        }

        // Format messages for client
        const messages = messagesData.map(msg => ({
            id: msg.id,
            content: msg.content,
            role: msg.role,
            createdAt: msg.created_at,
            parentMessageId: msg.parent_message_id,
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
            operationId,
            chatId,
            messageCount: messages.length
        });

        return NextResponse.json(response);

    } catch (error) {
        edgeLogger.error('Unexpected error getting chat', {
            operationId,
            chatId,
            error: error instanceof Error ? error.message : String(error)
        });

        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        );
    }
}

// PATCH handler to update chat metadata
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const operationId = `patch_chat_${Math.random().toString(36).substring(2, 10)}`;
    const chatId = params.id;

    edgeLogger.info('Chat PATCH request started', {
        chatId,
        operationId
    });

    try {
        // Parse request body
        let body;
        try {
            body = await request.json();
        } catch (error) {
            edgeLogger.error('Failed to parse request JSON', {
                operationId,
                error: error instanceof Error ? error.message : String(error)
            });

            return NextResponse.json(
                { error: 'Invalid JSON: Failed to parse request body' },
                { status: 400 }
            );
        }

        // Authenticate user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed updating chat', {
                operationId,
                error: authError?.message || 'No user found'
            });

            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Verify the chat exists and belongs to this user
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('id, user_id')
            .eq('id', chatId)
            .single();

        if (sessionError || !sessionData) {
            edgeLogger.error('Chat not found for update', {
                operationId,
                chatId,
                error: sessionError?.message || 'Session not found'
            });

            return NextResponse.json(
                { error: 'Chat not found' },
                { status: 404 }
            );
        }

        // Verify ownership
        if (sessionData.user_id !== user.id) {
            edgeLogger.warn('User attempted to update chat they do not own', {
                operationId,
                userId: user.id,
                chatUserId: sessionData.user_id
            });

            return NextResponse.json(
                { error: 'Unauthorized - you do not have access to this chat' },
                { status: 403 }
            );
        }

        // Update the relevant fields
        const updateData: { title?: string } = {};

        // Title update
        if (body.title !== undefined) {
            updateData.title = body.title;
        }

        // If nothing to update, return success
        if (Object.keys(updateData).length === 0) {
            edgeLogger.info('No fields to update', {
                operationId,
                chatId
            });

            return NextResponse.json({ success: true });
        }

        // Perform the update
        const { error: updateError } = await supabase
            .from('sd_chat_sessions')
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            })
            .eq('id', chatId);

        if (updateError) {
            edgeLogger.error('Error updating chat', {
                operationId,
                chatId,
                error: updateError.message
            });

            return NextResponse.json(
                { error: 'Error updating chat' },
                { status: 500 }
            );
        }

        edgeLogger.info('Successfully updated chat', {
            operationId,
            chatId,
            fields: Object.keys(updateData).join(', ')
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        edgeLogger.error('Unexpected error updating chat', {
            operationId,
            chatId,
            error: error instanceof Error ? error.message : String(error)
        });

        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        );
    }
} 