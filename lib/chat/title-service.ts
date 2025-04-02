import { titleLogger } from '../logger/title-logger';
import { createClient } from '../../utils/supabase/server';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Cache keys - used only for basic tracking, no locking or rate limiting
// const TITLE_GENERATION_ATTEMPTS_KEY = 'title_generation:attempts';

/**
 * Clean and validate a title from the AI response
 */
function cleanTitle(rawTitle: string): string {
    // Remove quotes that GPT often adds
    let cleanedTitle = rawTitle.trim().replace(/^["\']|["\']$/g, ''); // Fixed regex

    // Truncate if too long (50 chars max)
    if (cleanedTitle.length > 50) {
        cleanedTitle = cleanedTitle.substring(0, 47) + '...';
    }

    // Make sure it's not empty
    if (!cleanedTitle) {
        return 'Chat Summary';
    }

    return cleanedTitle;
}

/**
 * Checks if title generation should proceed based on message count and existing title.
 * @returns true if title generation should proceed, false otherwise.
 */
async function shouldGenerateTitle(chatId: string, userId?: string): Promise<boolean> {
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
 * Fetch the current title from the database
 */
async function getCurrentTitle(chatId: string, userId?: string): Promise<string | null> {
    const startTime = performance.now();
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('sd_chat_sessions')
            .select('title')
            .eq('id', chatId)
            .maybeSingle();

        if (error) {
            if (error.code !== 'PGRST116') {
                titleLogger.titleGenerationFailed({ chatId, userId, error: `Failed to fetch current title: ${error.message}`, durationMs: 0 });
            }
            return null;
        }

        return data?.title || null;
    } catch (error) {
        titleLogger.titleGenerationFailed({
            chatId,
            userId,
            error: `Exception fetching current title: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Math.round(performance.now() - startTime)
        });
        return null;
    }
}

/**
 * Update the title in the database
 */
async function updateTitleInDatabase(chatId: string, newTitle: string, userId?: string): Promise<boolean> {
    const startTime = performance.now();
    try {
        const supabase = await createClient();

        const { error } = await supabase
            .from('sd_chat_sessions')
            .update({
                title: newTitle,
                updated_at: new Date().toISOString()
            })
            .eq('id', chatId);

        if (error) {
            throw new Error(`Database update failed: ${error.message}`);
        }

        // Invalidate history cache to ensure the sidebar shows the new title
        try {
            // TODO: Replace fetch with a more robust inter-service communication if needed
            // Or consider if cache invalidation is truly necessary here or handled elsewhere
            // For now, keep the fetch but acknowledge it might not be ideal
            fetch('/api/history/invalidate', { method: 'POST' });
        } catch (cacheError) {
            titleLogger.titleGenerationFailed({
                chatId,
                userId,
                error: `Cache invalidation fetch failed: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
                durationMs: 0 // Duration isn't relevant here
            });
        }

        titleLogger.titleUpdateResult({
            chatId,
            newTitle,
            success: true,
            userId,
            durationMs: Math.round(performance.now() - startTime)
        });
        return true;

    } catch (error) {
        titleLogger.titleUpdateResult({
            chatId,
            newTitle,
            success: false,
            userId,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Math.round(performance.now() - startTime)
        });
        return false;
    }
}

/**
 * Generate and save a title for a chat session based on first user message.
 * Includes logic to check if generation should proceed.
 */
export async function generateAndSaveChatTitle(
    chatId: string,
    firstUserMessageContent: string,
    userId?: string
): Promise<void> {
    if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
        titleLogger.titleGenerationFailed({ chatId, userId, error: 'Skipping generation: No message content provided', durationMs: 0 });
        return;
    }

    const startTime = performance.now();

    try {
        const proceed = await shouldGenerateTitle(chatId, userId);
        if (!proceed) { return; }

        titleLogger.attemptGeneration({ chatId, userId });

        // Truncate message for API call if needed
        const truncatedMessage = firstUserMessageContent.length > 1000
            ? firstUserMessageContent.substring(0, 1000) + '...'
            : firstUserMessageContent;

        // Generate title using Vercel AI SDK with OpenAI
        const llmStartTime = performance.now();
        const result = await generateText({
            model: openai('gpt-3.5-turbo'), // Consider gpt-4o-mini for cost/speed?
            messages: [
                {
                    role: 'system',
                    content: 'Create a title that summarizes the main topic or intent of the user message in 2-6 words. Do not use quotes in your response. Keep it concise and relevant.'
                },
                {
                    role: 'user',
                    content: truncatedMessage
                }
            ],
            maxTokens: 30,
            temperature: 0.6 // Slightly reduced temperature for consistency
        });
        const llmDurationMs = Math.round(performance.now() - llmStartTime);

        // Extract and clean the title
        const cleanedTitle = cleanTitle(result.text || 'Chat Conversation');

        titleLogger.titleGenerated({
            chatId,
            userId,
            generatedTitle: cleanedTitle,
            durationMs: llmDurationMs
        });

        // Update the title in the database
        await updateTitleInDatabase(chatId, cleanedTitle, userId);
        // Logging for update result happens within updateTitleInDatabase

    } catch (error) {
        // Catch errors from shouldGenerateTitle, generateText, or updateTitleInDatabase
        titleLogger.titleGenerationFailed({
            chatId,
            userId,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Math.round(performance.now() - startTime)
        });
    }
} 