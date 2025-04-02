import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { z } from 'zod';
import { successResponse, errorResponse, unauthorizedError, validationError, withErrorHandling } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

// Declare edge runtime
export const runtime = 'edge';

const sessionSchema = z.object({
    id: z.string().uuid(),
    title: z.string().optional(),
    agentId: z.string().optional(),
    deepSearchEnabled: z.boolean().optional()
});

/**
 * POST handler to create a new chat session
 */
export const POST = withErrorHandling(async (
    request: Request
): Promise<Response> => {
    const operationId = `create_session_${Math.random().toString(36).substring(2, 10)}`;

    edgeLogger.debug('Creating new chat session', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'session_create',
        operationId
    });

    try {
        const body = await request.json();
        edgeLogger.debug('Request body', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'session_create',
            operationId,
            body
        });

        const result = sessionSchema.safeParse(body);
        if (!result.success) {
            edgeLogger.error('Invalid request body', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'session_create_error',
                operationId,
                errors: result.error.format()
            });
            return validationError('Invalid request body', result.error.format());
        }

        const { id, title, agentId, deepSearchEnabled } = result.data;

        if (!id) {
            edgeLogger.error('Missing session ID', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'session_create_error',
                operationId
            });
            return validationError('Missing session ID');
        }

        // Authenticate user
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed creating session', {
                category: LOG_CATEGORIES.AUTH,
                operation: 'session_create_error',
                operationId,
                error: authError?.message || 'No user found'
            });

            return unauthorizedError('Authentication required');
        }

        // Create the session
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .insert({
                id,
                title: title || 'Untitled Conversation',
                user_id: user.id,
                agent_id: agentId,
                deep_search_enabled: deepSearchEnabled || false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (sessionError) {
            edgeLogger.error('Error creating chat session', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'session_create_error',
                operationId,
                sessionId: id,
                error: sessionError.message,
                important: true
            });

            return errorResponse('Error creating chat session', sessionError.message, 500);
        }

        edgeLogger.info('Chat session created successfully', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'session_create_success',
            operationId,
            sessionId: id
        });

        return successResponse(sessionData);
    } catch (error) {
        edgeLogger.error('Unexpected error creating chat session', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'session_create_error',
            operationId,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        return errorResponse(
            'Unexpected error creating chat session',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
});

/**
 * GET handler to retrieve all sessions for the authenticated user
 */
export const GET = withErrorHandling(async (
    request: Request
): Promise<Response> => {
    const operationId = `get_sessions_${Math.random().toString(36).substring(2, 10)}`;

    edgeLogger.debug('Retrieving chat sessions', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'sessions_get',
        operationId
    });

    try {
        // Get Supabase client with the standardized utility
        const supabase = await createRouteHandlerClient();

        // Verify the user is authenticated
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return unauthorizedError('Authentication required');
        }

        // Get the user's chat sessions
        const { data: sessions, error } = await supabase
            .from('sd_chat_sessions')
            .select('id, title, created_at, updated_at')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (error) {
            edgeLogger.error('Error fetching chat sessions', {
                category: LOG_CATEGORIES.CHAT,
                userId: user.id,
                error: error.message
            });

            return errorResponse('Failed to fetch chat sessions', error.message, 500);
        }

        edgeLogger.info('Chat sessions retrieved successfully', {
            category: LOG_CATEGORIES.CHAT,
            userId: user.id,
            count: sessions?.length || 0
        });

        return successResponse({ sessions: sessions || [] });
    } catch (error) {
        edgeLogger.error('Exception in chat sessions API', {
            category: LOG_CATEGORIES.CHAT,
            error: error instanceof Error ? error.message : String(error)
        });

        return errorResponse(
            'Failed to fetch chat sessions',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
}); 