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
    let userId = 'unknown';
    let chatId = 'unknown';

    try {
        // 1. Manual Auth Check
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        // **Log Auth Result**
        edgeLogger.debug(`[${operationId}] Auth check result`, { authError: authError?.message || null, hasUser: !!user });

        if (authError || !user) {
            edgeLogger.warn('Authentication required for GET chat', { operationId, error: authError?.message });
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }
        userId = user.id; // Assign userId

        // 2. Await and Validate Params
        edgeLogger.debug(`[${operationId}] Awaiting params...`);
        const resolvedParams = await params;
        chatId = resolvedParams.id; // This ID from the URL IS the primary key 'id'
        edgeLogger.debug(`[${operationId}] Resolved params`, { chatId });

        if (!chatId) {
            edgeLogger.warn(`[${operationId}] Chat ID missing from params`, { resolvedParams });
            const errRes = validationError('Chat ID is required');
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Fetching chat details', { operationId, chatId: chatId.slice(0, 8), userId: userId.substring(0, 8) });

        // 3. Main Logic (DB Query with RLS)
        const { data: chat, error: dbError } = await supabase
            .from('sd_chat_sessions')
            .select('*')
            .eq('id', chatId) // CORRECT: Filter by primary key 'id'
            .eq('user_id', userId)
            .maybeSingle();

        // **Log DB Result**
        edgeLogger.debug(`[${operationId}] DB query result`, { dbError: dbError || null, chatFound: !!chat });

        if (dbError) {
            edgeLogger.error('Error fetching chat session', {
                operationId,
                chatId: chatId.slice(0, 8),
                error: dbError.message,
                code: dbError.code, // Log DB error code
                details: dbError.details, // Log DB error details
                hint: dbError.hint // Log DB error hint
            });
            const errRes = errorResponse('Failed to fetch chat session', dbError);
            return handleCors(errRes, request, true);
        }

        if (!chat) {
            edgeLogger.warn('Chat session not found or unauthorized', { operationId, chatId: chatId.slice(0, 8), userId: userId.substring(0, 8) });
            const errRes = notFoundError('Chat not found');
            return handleCors(errRes, request, true);
        }

        // ADDED: Fetch messages associated with the chat session
        const { data: messages, error: messagesError } = await supabase
            .from('sd_chat_histories')
            .select('*') // Select all message fields
            .eq('session_id', chat.id) // Filter by the session's primary key
            .eq('user_id', userId) // Ensure RLS is enforced (belt-and-suspenders)
            .order('created_at', { ascending: true }); // Order messages chronologically

        if (messagesError) {
            edgeLogger.error('Error fetching chat messages', {
                operationId,
                chatId: chatId.slice(0, 8),
                userId: userId.substring(0, 8),
                error: messagesError.message
            });
            // Consider if this should be fatal. For now, return session without messages maybe?
            // Let's make it fatal for consistency.
            const errRes = errorResponse('Failed to fetch chat messages', messagesError);
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Successfully fetched chat session and messages', { operationId, chatId: chatId.slice(0, 8), messageCount: messages?.length || 0 });

        // 4. Combine session details and messages, then Return Success Response (wrapped with CORS)
        const responsePayload = {
            ...chat,
            messages: messages || [] // Ensure messages is always an array
        };
        const response = successResponse(responsePayload);
        return handleCors(response, request, true);

    } catch (error) {
        // 5. Catch Unexpected Errors (wrapped with CORS)
        edgeLogger.error('Unexpected error in GET chat handler', {
            operationId,
            chatId: chatId, // Log potentially known chatId
            userId: userId, // Log potentially known userId
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            important: true
        });
        const errRes = errorResponse('Unexpected error fetching chat', error, 500);
        return handleCors(errRes, request, true);
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
        const chatId = resolvedParams.id; // This ID from the URL IS the primary key 'id'

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
            .from('sd_chat_sessions')
            .update(updateData)
            .eq('id', chatId) // CORRECT: Filter by primary key 'id'
            .eq('user_id', user.id)
            .select()
            .single();

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

// --- DELETE Handler (Pattern B) ---
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
        const chatId = resolvedParams.id; // This ID from the URL IS the primary key 'id' for sd_sessions

        if (!chatId) {
            return handleCors(validationError('Chat ID is required'), request, true);
        }

        edgeLogger.info('Deleting chat session', {
            operationId,
            chatId: chatId.slice(0, 8),
            userId: user.id.substring(0, 8)
        });

        // Delete related messages first (using session_id foreign key - this is correct)
        const { error: messagesError } = await supabase
            .from('sd_chat_histories')
            .delete()
            .eq('session_id', chatId) // History table uses session_id FK, matching the session's PK ('id')
            .eq('user_id', user.id);

        if (messagesError) {
            edgeLogger.error('Error deleting chat messages before session', { operationId, chatId: chatId.slice(0, 8), error: messagesError.message });
            // Decide if this is fatal or just a warning - let's make it fatal for now
            return handleCors(errorResponse('Failed to delete associated messages', messagesError), request, true);
        }

        // Delete the session (using primary key 'id')
        const { error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .delete()
            .eq('id', chatId) // CORRECT: Filter by primary key 'id'
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
