/**
 * Chat ID API Route
 * 
 * This route handler manages operations for specific chat sessions by ID:
 * - GET: Retrieves a specific chat including its messages
 * - PATCH: Updates chat metadata (like title)
 */

import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError, notFoundError, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import type { IdParam } from '@/lib/types/route-handlers';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

export const runtime = 'edge';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

// Validation schema for PATCH requests
const patchChatSchema = z.object({
    title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
    model: z.string().optional(),
    agent_id: z.string().optional(), // Allow optional agent ID update
});

// GET handler to retrieve a specific chat and its messages
export async function GET(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    const operationId = `get_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for GET chat', { operationId, error: authError?.message });
            return handleCors(unauthorizedError('Authentication required'), request, true);
        }

        const resolvedParams = await params;
        const chatId = resolvedParams.id;

        if (!chatId) {
            return handleCors(validationError('Chat ID is required'), request, true);
        }

        edgeLogger.info('Fetching chat details', { operationId, chatId: chatId.slice(0, 8), userId: user.id.substring(0, 8) });

        const { data: chat, error } = await supabase
            .from('sd_sessions')
            .select('*')
            .eq('session_id', chatId)
            .eq('user_id', user.id) // RLS should enforce this, but explicit check is good
            .maybeSingle();

        if (error) {
            edgeLogger.error('Error fetching chat', { operationId, chatId: chatId.slice(0, 8), error: error.message });
            return handleCors(errorResponse('Failed to fetch chat', error), request, true);
        }

        if (!chat) {
            edgeLogger.warn('Chat not found or unauthorized', { operationId, chatId: chatId.slice(0, 8), userId: user.id.substring(0, 8) });
            return handleCors(notFoundError('Chat not found'), request, true);
        }

        edgeLogger.info('Successfully fetched chat details', { operationId, chatId: chatId.slice(0, 8) });
        return handleCors(successResponse(chat), request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in GET chat handler', { operationId, error: error instanceof Error ? error.message : String(error) });
        return handleCors(errorResponse('Unexpected error fetching chat', error, 500), request, true);
    }
}

// PATCH handler to update chat metadata
export async function PATCH(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    const operationId = `patch_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for PATCH chat', { operationId, error: authError?.message });
            return handleCors(unauthorizedError('Authentication required'), request, true);
        }

        const resolvedParams = await params;
        const chatId = resolvedParams.id;

        if (!chatId) {
            return handleCors(validationError('Chat ID is required'), request, true);
        }

        // Parse and validate request body
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return handleCors(validationError('Invalid JSON body'), request, true);
        }

        const validationResult = patchChatSchema.safeParse(body);
        if (!validationResult.success) {
            return handleCors(validationError('Invalid request body', validationResult.error.errors), request, true);
        }
        const { title, model, agent_id } = validationResult.data;

        edgeLogger.info('Updating chat details', {
            operationId,
            chatId: chatId.slice(0, 8),
            userId: user.id.substring(0, 8),
            updates: { title, model, agent_id }
        });

        // Construct update object conditionally
        const updateData: Record<string, any> = { title };
        if (model !== undefined) updateData.model = model;
        if (agent_id !== undefined) updateData.agent_id = agent_id;
        updateData.updated_at = new Date().toISOString(); // Ensure updated_at is set

        // Update chat session in database (RLS enforced)
        const { data, error } = await supabase
            .from('sd_sessions')
            .update(updateData)
            .eq('session_id', chatId)
            .eq('user_id', user.id)
            .select()
            .single(); // Ensure only one record is updated and return it

        if (error) {
            edgeLogger.error('Error updating chat', { operationId, chatId: chatId.slice(0, 8), error: error.message });
            // Check for specific errors like not found (maybe due to RLS or wrong ID)
            if (error.code === 'PGRST116') { // PostgREST code for no rows found
                return handleCors(notFoundError('Chat not found or permission denied'), request, true);
            }
            return handleCors(errorResponse('Failed to update chat', error), request, true);
        }

        if (!data) { // Should be handled by .single() error, but belt-and-suspenders
            return handleCors(notFoundError('Chat not found or permission denied after update'), request, true);
        }

        edgeLogger.info('Successfully updated chat details', { operationId, chatId: chatId.slice(0, 8) });
        return handleCors(successResponse(data), request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in PATCH chat handler', { operationId, error: error instanceof Error ? error.message : String(error) });
        return handleCors(errorResponse('Unexpected error updating chat', error, 500), request, true);
    }
}

// --- DELETE Handler --- 
export async function DELETE(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    const operationId = `delete_chat_${Math.random().toString(36).substring(2, 10)}`;

    try {
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for DELETE chat', { operationId, error: authError?.message });
            return handleCors(unauthorizedError('Authentication required'), request, true);
        }

        const resolvedParams = await params;
        const chatId = resolvedParams.id;

        if (!chatId) {
            return handleCors(validationError('Chat ID is required'), request, true);
        }

        edgeLogger.info('Deleting chat session', {
            operationId,
            chatId: chatId.slice(0, 8),
            userId: user.id.substring(0, 8)
        });

        // Delete chat session (RLS enforced)
        // Consider deleting related messages first if FK constraints aren't set to CASCADE
        const { error: messagesError } = await supabase
            .from('sd_chat_histories')
            .delete()
            .eq('session_id', chatId)
            .eq('user_id', user.id);

        if (messagesError) {
            edgeLogger.error('Error deleting chat messages before session', { operationId, chatId: chatId.slice(0, 8), error: messagesError.message });
            // Decide if this is fatal or just a warning - let's make it fatal for now
            return handleCors(errorResponse('Failed to delete associated messages', messagesError), request, true);
        }

        const { error: sessionError } = await supabase
            .from('sd_sessions')
            .delete()
            .eq('session_id', chatId)
            .eq('user_id', user.id);

        if (sessionError) {
            edgeLogger.error('Error deleting chat session', { operationId, chatId: chatId.slice(0, 8), error: sessionError.message });
            return handleCors(errorResponse('Failed to delete chat session', sessionError), request, true);
        }

        // Note: DELETE might not return data by default, check Supabase docs if needed
        edgeLogger.info('Successfully deleted chat session', { operationId, chatId: chatId.slice(0, 8) });
        return handleCors(successResponse({ deleted: true }), request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in DELETE chat handler', { operationId, error: error instanceof Error ? error.message : String(error) });
        return handleCors(errorResponse('Unexpected error deleting chat', error, 500), request, true);
    }
}
