import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { titleLogger } from '@/lib/logger/title-logger';

export const runtime = 'edge';

/**
 * Update the title of a chat session using AI generation based on content.
 */
export async function POST(request: Request): Promise<Response> {
    const operationStartTime = Date.now();
    const operationId = request.headers.get('x-operation-id') || `update_title_${crypto.randomUUID().substring(0, 8)}`;
    let chatId = ''; // Initialize chatId for logging scope
    let userId = ''; // Initialize userId for logging scope

    try {
        const body = await request.json();
        const { sessionId, content, userId: providedUserId } = body;
        chatId = sessionId; // Assign chatId for logging

        if (!sessionId) return validationError('Session ID is required');
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return validationError('Valid content is required for title generation');
        }

        // --- Authentication --- 
        const supabase = await createRouteHandlerClient();
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || '';

        // Fallback/Verification using providedUserId (consider security implications)
        if (!userId && providedUserId) {
            const { data: sessionData } = await supabase.from('sd_chat_sessions').select('user_id').eq('id', sessionId).maybeSingle();
            if (sessionData && sessionData.user_id === providedUserId) {
                userId = providedUserId;
                edgeLogger.debug('Service call authenticated via provided user ID match', { category: LOG_CATEGORIES.AUTH, sessionId, userId, operationId });
            } else {
                edgeLogger.warn('Unauthorized service call for title update', { category: LOG_CATEGORIES.AUTH, sessionId, providedUserId, operationId });
                return unauthorizedError('Unauthorized service call');
            }
        } else if (!userId) {
            edgeLogger.warn('User authentication required for title update', { category: LOG_CATEGORIES.AUTH, sessionId, operationId });
            return unauthorizedError('Authentication required');
        }
        // At this point, userId should be set if authentication passed

        edgeLogger.info('Processing title generation request', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_api',
            sessionId,
            userId,
            operationId
        });

        // --- Title Generation --- 
        const llmStartTime = Date.now();
        try {
            const result = await generateText({
                model: openai('gpt-3.5-turbo'),
                messages: [
                    { role: 'system', content: 'Create a title that summarizes the main topic or intent of the user message in 2-6 words. Do not use quotes. Keep it concise and relevant.' },
                    { role: 'user', content: content.substring(0, 1000) } // Use truncated content
                ],
                maxTokens: 30,
                temperature: 0.6
            });
            const llmDurationMs = Date.now() - llmStartTime;

            const generatedTitle = cleanTitle(result.text || 'Chat Summary');

            titleLogger.titleGenerated({
                chatId: sessionId, userId,
                generatedTitle,
                durationMs: llmDurationMs
            });

            // --- Database Update --- 
            const dbUpdateSuccess = await updateTitleInDatabase(sessionId, generatedTitle, userId);

            if (!dbUpdateSuccess) {
                // Error already logged within updateTitleInDatabase
                return errorResponse('Failed to update title in database', null, 500);
            }

            edgeLogger.info('Title update successful', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_api_success',
                sessionId, userId, operationId,
                generatedTitle,
                totalDurationMs: Date.now() - operationStartTime
            });

            return successResponse({ chatId: sessionId, title: generatedTitle });

        } catch (genError) {
            titleLogger.titleGenerationFailed({
                chatId: sessionId, userId,
                error: `AI title generation failed: ${genError instanceof Error ? genError.message : String(genError)}`,
                durationMs: Date.now() - llmStartTime
            });
            return errorResponse('Failed during AI title generation', genError, 500);
        }

    } catch (error) {
        // Catch errors from body parsing or auth
        edgeLogger.error('Error in update-title handler', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_api_error',
            sessionId: chatId || 'unknown', // Use chatId if available
            userId: userId || 'unknown', // Use userId if available
            error: error instanceof Error ? error.message : String(error),
            operationId,
            important: true,
            durationMs: Date.now() - operationStartTime
        });

        // Determine if it was a validation error or other server error
        if (error instanceof SyntaxError || error instanceof TypeError) {
            return validationError('Invalid request', error);
        } else if (error instanceof Response) { // Handle standardized errors from auth
            return error;
        }
        return errorResponse('Internal server error processing title update', error, 500);
    }
} 