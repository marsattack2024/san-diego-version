import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError, validationError, withErrorHandling } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { generateAndSaveChatTitle } from '@/lib/chat/title-service';

export const runtime = 'edge';

/**
 * Update the title of a chat session
 * This API does two things:
 * 1. If just given sessionId and content, it uses AI to generate a title for the session
 * 2. If given sessionId and newTitle (via content), it directly updates the title
 */
export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
    try {
        // Parse the incoming request data
        const body = await request.json();

        // Map the received parameters to what the endpoint expects internally
        const { sessionId, content, userId: providedUserId } = body;

        // Input validation
        if (!sessionId) {
            return validationError('Session ID is required');
        }

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return validationError('Valid content is required for title generation');
        }

        // Get Supabase client
        const supabase = await createRouteHandlerClient();

        // User authentication
        const { data: { user } } = await supabase.auth.getUser();
        let userId = user?.id;

        // If no authenticated user but we have a provided userId (from service-to-service calls)
        // Try to verify the session exists for fallback authentication
        if (!userId && providedUserId) {
            const { data: sessionData, error: sessionError } = await supabase
                .from('sd_chat_sessions')
                .select('id, user_id')
                .eq('id', sessionId)
                .single();

            if (!sessionError && sessionData) {
                userId = sessionData.user_id;
                edgeLogger.debug('Using session lookup for authentication', {
                    category: LOG_CATEGORIES.CHAT,
                    sessionId,
                    userId
                });
            } else {
                edgeLogger.warn('Unauthorized title update attempt with service credentials', {
                    category: LOG_CATEGORIES.CHAT,
                    sessionId,
                    providedUserId
                });
                return unauthorizedError('Unauthorized and could not find session');
            }
        }

        if (!userId) {
            edgeLogger.warn('Authentication required for title update', {
                category: LOG_CATEGORIES.CHAT,
                sessionId,
                requestHasUserId: !!providedUserId
            });

            return unauthorizedError('Authentication required');
        }

        edgeLogger.info('Generating title for chat', {
            category: LOG_CATEGORIES.CHAT,
            sessionId,
            userId
        });

        try {
            // Use the title generation service to create a title based on content
            await generateAndSaveChatTitle(sessionId, content, userId);

            // Fetch the generated title from the database
            const { data: sessionData, error: fetchError } = await supabase
                .from('sd_chat_sessions')
                .select('title')
                .eq('id', sessionId)
                .single();

            if (fetchError || !sessionData) {
                edgeLogger.error('Failed to fetch generated title', {
                    category: LOG_CATEGORIES.CHAT,
                    sessionId,
                    userId,
                    error: fetchError?.message || 'No session data returned'
                });

                return errorResponse('Failed to generate title', fetchError);
            }

            return successResponse({
                chatId: sessionId,
                title: sessionData.title
            });
        } catch (error) {
            edgeLogger.error('Error generating title', {
                category: LOG_CATEGORIES.CHAT,
                error: error instanceof Error ? error.message : String(error),
                sessionId,
                userId
            });

            return errorResponse('Failed to generate title', error);
        }
    } catch (error) {
        edgeLogger.error('Failed to parse request body', {
            category: LOG_CATEGORIES.CHAT,
            error: error instanceof Error ? error.message : String(error)
        });

        return validationError('Invalid request body', error);
    }
}); 