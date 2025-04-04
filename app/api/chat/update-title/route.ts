import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import { createRouteHandlerClient, createRouteHandlerAdminClient } from '@/lib/supabase/route-client';
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { titleLogger } from '@/lib/logger/title-logger';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Update the title of a chat session using AI generation based on content.
 * Authenticates via INTERNAL_API_SECRET header for internal calls,
 * or standard user session for direct calls (though direct calls are not intended).
 */
export async function POST(request: Request): Promise<Response> {
    const operationStartTime = Date.now();
    const operationId = request.headers.get('x-operation-id') || `update_title_${crypto.randomUUID().substring(0, 8)}`;
    let chatId = '';
    let userIdFromRequest = '';
    let authMethod = 'unknown'; // Track how auth was performed

    try {
        const body = await request.json();
        const { sessionId, content, userId } = body;
        chatId = sessionId;
        userIdFromRequest = userId;

        if (!sessionId) return validationError('Session ID is required');
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return validationError('Valid content is required for title generation');
        }
        // Note: userId from body is now required for the internal call logic
        if (!userId) {
            return validationError('User ID is required in the request body');
        }

        // --- Authentication Check --- 
        let isAuthenticated = false;
        const internalSecretFromHeader = request.headers.get('X-Internal-Secret');
        const internalSecretFromEnv = process.env.INTERNAL_API_SECRET;
        let isInternalRequest = false;

        if (internalSecretFromHeader && internalSecretFromEnv && internalSecretFromHeader === internalSecretFromEnv) {
            // Authenticated via internal secret
            isAuthenticated = true;
            isInternalRequest = true;
            authMethod = 'internal_secret';
            edgeLogger.debug('Authenticated via internal API secret', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                sessionId,
                userId: userIdFromRequest
            });
            // We trust the userId passed in the body for internal calls
        } else {
            // Fallback: Try standard user session authentication (cookie-based)
            authMethod = 'cookie_session';
            edgeLogger.debug('Attempting standard cookie authentication (fallback)', { category: LOG_CATEGORIES.AUTH, operationId, sessionId });
            try {
                const supabase = await createRouteHandlerClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user && user.id === userIdFromRequest) { // Verify user matches body
                    isAuthenticated = true;
                    edgeLogger.info('Authenticated via cookie session', { category: LOG_CATEGORIES.AUTH, operationId, sessionId, userId: user.id });
                } else if (user) {
                    edgeLogger.warn('Cookie user mismatch with body userId', { category: LOG_CATEGORIES.AUTH, operationId, sessionId, cookieUserId: user.id, bodyUserId: userIdFromRequest });
                }
            } catch (authError) {
                edgeLogger.warn('Cookie authentication failed', { category: LOG_CATEGORIES.AUTH, operationId, sessionId, error: authError instanceof Error ? authError.message : String(authError) });
            }
        }

        if (!isAuthenticated) {
            edgeLogger.warn('Authentication failed for title update', { category: LOG_CATEGORIES.AUTH, operationId, sessionId, userId: userIdFromRequest, authMethod });
            return unauthorizedError('Authentication required');
        }
        // --- End Authentication --- 

        edgeLogger.info('Processing authenticated title generation request', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_api',
            sessionId,
            userId: userIdFromRequest,
            operationId,
            authMethod // Log how auth was performed
        });

        // Create the appropriate client instance AFTER authentication
        // Use admin client for internal requests to bypass RLS
        const supabase = isInternalRequest
            ? await createRouteHandlerAdminClient()
            : await createRouteHandlerClient();

        // Log the client type being used
        edgeLogger.debug('Using Supabase client', {
            category: LOG_CATEGORIES.SYSTEM,
            clientType: isInternalRequest ? 'admin_client' : 'standard_client',
            operationId,
            sessionId
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
                chatId: sessionId, userId: userIdFromRequest,
                generatedTitle,
                durationMs: llmDurationMs
            });

            // --- Database Update --- 
            // Pass the supabase client instance created above
            const dbUpdateSuccess = await updateTitleInDatabase(supabase, sessionId, generatedTitle, userIdFromRequest);

            if (!dbUpdateSuccess) {
                // Error already logged within updateTitleInDatabase via titleLogger
                return errorResponse('Failed to update title in database', null, 500);
            }

            edgeLogger.info('Title update successful', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_api_success',
                sessionId, userId: userIdFromRequest, operationId,
                generatedTitle,
                totalDurationMs: Date.now() - operationStartTime
            });

            return successResponse({ chatId: sessionId, title: generatedTitle });

        } catch (genError) {
            titleLogger.titleGenerationFailed({
                chatId: sessionId, userId: userIdFromRequest,
                error: `AI title generation failed: ${genError instanceof Error ? genError.message : String(genError)}`,
                durationMs: Date.now() - llmStartTime
            });
            return errorResponse('Failed during AI title generation', genError, 500);
        }

    } catch (error) {
        // Catch errors from body parsing
        edgeLogger.error('Error in update-title handler', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_api_error',
            sessionId: chatId || 'unknown',
            userId: userIdFromRequest || 'unknown', // Log userId from request if available
            error: error instanceof Error ? error.message : String(error),
            operationId,
            important: true,
            durationMs: Date.now() - operationStartTime,
            authMethod // Include auth method in error logs
        });

        // Determine if it was a validation error or other server error
        if (error instanceof SyntaxError || error instanceof TypeError) {
            return validationError('Invalid request', error);
        }
        // Removed Response check as we don't expect it from internal calls
        return errorResponse('Internal server error processing title update', error, 500);
    }
} 