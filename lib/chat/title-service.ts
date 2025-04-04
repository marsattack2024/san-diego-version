import { titleLogger } from '../logger/title-logger';
import { createClient } from '../../utils/supabase/server';

// Cache keys - used only for basic tracking, no locking or rate limiting
// const TITLE_GENERATION_ATTEMPTS_KEY = 'title_generation:attempts';

/**
 * Checks if title generation should proceed based on message count and existing title.
 * @returns true if title generation should proceed, false otherwise.
 */
export async function shouldGenerateTitle(chatId: string, userId?: string): Promise<boolean> {
    const startTime = performance.now();
    try {
        const supabase = await createClient();

        // 1. Check session title
        const { data: sessionData, error: sessionError } = await supabase
            .from('sd_chat_sessions')
            .select('title')
            .eq('id', chatId)
            .maybeSingle();

        if (sessionError) {
            titleLogger.titleGenerationFailed({ chatId, userId, error: `Error fetching session data: ${sessionError.message}`, durationMs: Date.now() - startTime });
            return false;
        }

        const defaultTitles = ['New Chat', 'Untitled Conversation', 'New Conversation', null, undefined, ''];
        if (sessionData && sessionData.title && !defaultTitles.includes(sessionData.title)) {
            titleLogger.titleExists({ chatId, userId, currentTitle: sessionData.title });
            return false;
        }

        // 2. Check message count
        const { count, error: countError } = await supabase
            .from('sd_chat_histories')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', chatId);

        if (countError) {
            titleLogger.titleGenerationFailed({ chatId, userId, error: `Error counting messages: ${countError.message}`, durationMs: Date.now() - startTime });
            return sessionData === null;
        }

        const messageCount = count === null ? 0 : count;
        const proceed = messageCount <= 2;

        if (!proceed) {
            titleLogger.titleGenerationFailed({ chatId, userId, error: `Skipping generation: message count ${messageCount} > 2`, durationMs: 0 });
        }

        return proceed;

    } catch (error) {
        titleLogger.titleGenerationFailed({
            chatId,
            userId,
            error: `Unexpected error during title check: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Math.round(performance.now() - startTime)
        });
        return false;
    }
}

/**
 * Triggers the title generation process by calling the dedicated API endpoint.
 * Includes logic to check if generation should proceed based on message count/existing title.
 *
 * @param chatId - The ID of the chat session.
 * @param firstUserMessageContent - The content of the user's message to base the title on.
 * @param userId - The ID of the user (for checking conditions and potentially for auth header).
 */
export async function triggerTitleGenerationViaApi(
    chatId: string,
    firstUserMessageContent: string,
    userId?: string
): Promise<void> {
    if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
        titleLogger.titleGenerationFailed({ chatId, userId, error: 'Skipping trigger: No message content provided', durationMs: 0 });
        return;
    }

    const startTime = performance.now();
    const operationId = `trigger_title_${crypto.randomUUID().substring(0, 8)}`;

    try {
        const proceed = await shouldGenerateTitle(chatId, userId);
        if (!proceed) {
            // Logging handled within shouldGenerateTitle
            return;
        }

        titleLogger.attemptGeneration({ chatId, userId }); // Log the attempt to trigger

        const truncatedContent = firstUserMessageContent.substring(0, 1000); // Simplified truncation

        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const apiUrl = `${baseUrl}/api/chat/update-title`;

        // Get the internal secret from environment variables
        const internalSecret = process.env.INTERNAL_API_SECRET;
        if (!internalSecret) {
            titleLogger.titleGenerationFailed({ chatId, userId, error: 'INTERNAL_API_SECRET is not configured.', durationMs: 0 });
            console.error('[triggerTitleGenerationViaApi] INTERNAL_API_SECRET environment variable is not set.');
            return; // Cannot proceed without the secret
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'x-operation-id': operationId,
            'X-Internal-Secret': internalSecret, // Add the secret header
            ...(userId && { 'x-user-id-hint': userId }) // Pass userId as a hint (optional)
        };

        const body = JSON.stringify({
            sessionId: chatId,
            content: truncatedContent,
            userId // MUST pass userId in the body for the endpoint
        });

        fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            cache: 'no-store',
            body: body
        })
            .then(async response => {
                const durationMs = Math.round(performance.now() - startTime);
                if (response.ok) {
                    // Use titleUpdateResult to log successful trigger 
                    // Since we don't know the *actual* new title here, we log success without it.
                    titleLogger.titleUpdateResult({
                        chatId,
                        userId,
                        newTitle: '(Triggered)', // Indicate trigger, not actual title
                        success: true,
                        durationMs
                    });
                } else {
                    const responseText = await response.text().catch(() => 'Could not read response body');
                    titleLogger.titleGenerationFailed({
                        chatId, userId,
                        error: `Title trigger API call failed: ${response.status} ${response.statusText} - ${responseText.substring(0, 100)}`,
                        durationMs
                    });
                }
            })
            .catch(error => {
                const durationMs = Math.round(performance.now() - startTime);
                titleLogger.titleGenerationFailed({
                    chatId, userId,
                    error: `Title trigger fetch failed: ${error instanceof Error ? error.message : String(error)}`,
                    durationMs
                });
            });

    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        titleLogger.titleGenerationFailed({
            chatId, userId,
            error: `Title trigger process failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs
        });
    }
} 