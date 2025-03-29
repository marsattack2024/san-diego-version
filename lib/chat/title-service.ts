import { titleLogger } from '../logger/title-logger';
import { createClient } from '../../utils/supabase/server';
import { cacheService } from '../cache/cache-service';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Cache keys
const TITLE_GENERATION_ATTEMPTS_KEY = 'title_generation:attempts';
const TITLE_GENERATION_LOCK_KEY = 'title_generation:lock';

/**
 * Clean and validate a title from the AI response
 */
function cleanTitle(rawTitle: string): string {
    // Remove quotes that GPT often adds
    let cleanedTitle = rawTitle?.trim().replace(/^["']|["']$/g, '') || '';

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
async function getCurrentTitle(chatId: string): Promise<string | null> {
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

        return data?.title || null;
    } catch (error) {
        titleLogger.titleUpdateResult({
            chatId,
            newTitle: 'Error fetching current title',
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
}

/**
 * Update the title in the database
 */
async function updateTitleInDatabase(chatId: string, newTitle: string): Promise<boolean> {
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

        return true;
    } catch (error) {
        titleLogger.titleUpdateResult({
            chatId,
            newTitle,
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}

/**
 * Simple counter implementation for rate limiting
 */
async function incrementCounter(key: string, increment: number, ttlSeconds: number): Promise<number> {
    try {
        // Use Redis directly through the cacheService's Redis client
        const redis = await (cacheService as any).redisPromise;
        const value = await redis.incrby(key, increment);

        // Set expiry if it doesn't exist yet
        if (increment === 1) {
            await redis.expire(key, ttlSeconds);
        }

        return value;
    } catch (error) {
        console.error('Error incrementing counter:', error);
        return 0;
    }
}

/**
 * Set key only if it doesn't exist (NX in Redis)
 */
async function setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
        // Use Redis directly through the cacheService's Redis client
        const redis = await (cacheService as any).redisPromise;
        const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
        return result === 'OK';
    } catch (error) {
        console.error('Error setting NX:', error);
        return false;
    }
}

/**
 * Generate and save a title for a chat session based on first user message
 * Uses Redis for rate limiting and locking to prevent duplicate work
 */
export async function generateAndSaveChatTitle(
    chatId: string,
    firstUserMessageContent: string
): Promise<void> {
    // Skip if no message content
    if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
        return;
    }

    try {
        titleLogger.attemptGeneration({ chatId });

        // Check rate limiting - maximum 10 generation attempts per minute
        const currentAttempts = await incrementCounter(
            `${TITLE_GENERATION_ATTEMPTS_KEY}:global`,
            1,
            60
        );

        if (currentAttempts && currentAttempts > 10) {
            titleLogger.titleGenerationFailed({
                chatId,
                error: 'Rate limit exceeded for title generation'
            });
            return;
        }

        // Try to acquire lock to prevent multiple parallel generation attempts
        const lockAcquired = await setNX(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`, 'locked', 30);
        if (!lockAcquired) {
            titleLogger.titleGenerationFailed({
                chatId,
                error: 'Another title generation is already in progress'
            });
            return;
        }

        try {
            // Check if title is still default
            const currentTitle = await getCurrentTitle(chatId);
            if (currentTitle !== 'New Chat' && currentTitle !== 'Untitled Conversation' && currentTitle !== null) {
                return;
            }

            // Truncate message for API call if needed
            const truncatedMessage = firstUserMessageContent.length > 1000
                ? firstUserMessageContent.substring(0, 1000) + '...'
                : firstUserMessageContent;

            // Generate title using OpenAI
            const completion = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that generates concise, descriptive titles for chat conversations. Create a title that summarizes the main topic or intent of the user message in 5-7 words. Do not use quotes in your response.'
                    },
                    {
                        role: 'user',
                        content: truncatedMessage
                    }
                ],
                max_tokens: 30,
                temperature: 0.7
            });

            // Extract and clean the title
            const generatedTitle = completion.choices[0].message.content;
            const cleanedTitle = cleanTitle(generatedTitle || 'Chat Conversation');

            titleLogger.titleGenerated({
                chatId,
                generatedTitle: cleanedTitle
            });

            // Update the title in the database
            const success = await updateTitleInDatabase(chatId, cleanedTitle);

            if (success) {
                titleLogger.titleUpdateResult({
                    chatId,
                    newTitle: cleanedTitle,
                    success: true
                });
            }
        } finally {
            // Release the lock when done
            await cacheService.delete(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
        }
    } catch (error) {
        titleLogger.titleGenerationFailed({
            chatId,
            error: error instanceof Error ? error.message : String(error)
        });

        // Attempt to set a default title if we failed to generate one
        try {
            const defaultTitle = 'Chat ' + new Date().toLocaleDateString();
            await updateTitleInDatabase(chatId, defaultTitle);
        } catch (fallbackError) {
            // Fallback error can be safely ignored
        }
    }
} 