import { titleLogger } from '../logger/title-logger';
import { createClient } from '../../utils/supabase/server';
import { cacheService } from '../cache/cache-service';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Cache keys - used only for basic tracking, no locking or rate limiting
const TITLE_GENERATION_ATTEMPTS_KEY = 'title_generation:attempts';

/**
 * Clean and validate a title from the AI response
 */
function cleanTitle(rawTitle: string): string {
    // Remove quotes that GPT often adds
    let cleanedTitle = rawTitle.trim().replace(/^["']|["']$/g, '');

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
            .single();

        if (error) {
            throw new Error(`Failed to fetch current title: ${error.message}`);
        }

        const durationMs = Math.round(performance.now() - startTime);

        // Log if a non-default title already exists
        const defaultTitles = ['New Chat', 'Untitled Conversation', 'New Conversation', null, undefined, ''];
        if (data?.title && !defaultTitles.includes(data.title)) {
            titleLogger.titleExists({
                chatId,
                currentTitle: data.title,
                userId
            });
        }

        return data?.title || null;
    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        titleLogger.titleUpdateResult({
            chatId,
            newTitle: 'Error fetching current title',
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
            userId
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
            await fetch('/api/history/invalidate', { method: 'POST' });
        } catch (cacheError) {
            // Ignore cache invalidation errors, non-critical
        }

        const durationMs = Math.round(performance.now() - startTime);
        titleLogger.titleUpdateResult({
            chatId,
            newTitle,
            success: true,
            durationMs,
            userId
        });

        return true;
    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        titleLogger.titleUpdateResult({
            chatId,
            newTitle,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
            userId
        });
        return false;
    }
}

/**
 * Generate and save a title for a chat session based on first user message
 */
export async function generateAndSaveChatTitle(
    chatId: string,
    firstUserMessageContent: string,
    userId?: string
): Promise<void> {
    // Skip if no message content
    if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
        return;
    }

    const startTime = performance.now();

    try {
        titleLogger.attemptGeneration({ chatId, userId });

        // Check if title is still default
        const currentTitle = await getCurrentTitle(chatId, userId);
        const defaultTitles = ['New Chat', 'Untitled Conversation', 'New Conversation', null, undefined, ''];

        if (!defaultTitles.includes(currentTitle)) {
            titleLogger.titleExists({
                chatId,
                currentTitle: currentTitle || 'unknown',
                userId
            });
            return;
        }

        // Truncate message for API call if needed
        const truncatedMessage = firstUserMessageContent.length > 1000
            ? firstUserMessageContent.substring(0, 1000) + '...'
            : firstUserMessageContent;

        // Generate title using Vercel AI SDK with OpenAI
        const result = await generateText({
            model: openai('gpt-3.5-turbo'),
            messages: [
                {
                    role: 'system',
                    content: 'Create a title that summarizes the main topic or intent of the user message in 2-6 words. Do not use quotes in your response.'
                },
                {
                    role: 'user',
                    content: truncatedMessage
                }
            ],
            maxTokens: 30,
            temperature: 0.7
        });

        // Extract and clean the title
        const cleanedTitle = cleanTitle(result.text || 'Chat Conversation');

        // Update the title in the database
        const updated = await updateTitleInDatabase(chatId, cleanedTitle, userId);
        if (updated) {
            titleLogger.titleGenerated({
                chatId,
                generatedTitle: cleanedTitle,
                durationMs: Math.round(performance.now() - startTime),
                userId
            });

            // Log additional success information
            titleLogger.titleUpdateResult({
                chatId,
                newTitle: cleanedTitle,
                success: true,
                durationMs: Math.round(performance.now() - startTime),
                userId
            });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        titleLogger.titleGenerationFailed({
            chatId,
            error: errorMessage,
            durationMs: Math.round(performance.now() - startTime),
            userId
        });
    }
} 