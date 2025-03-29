import { titleLogger } from '../logger/title-logger';
import { createClient } from '../../utils/supabase/server';
import { cacheService } from '../cache/cache-service';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Cache keys
const TITLE_GENERATION_ATTEMPTS_KEY = 'title_generation:attempts';
const TITLE_GENERATION_LOCK_KEY = 'title_generation:lock';

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

        if (data?.title && data.title !== 'New Chat' && data.title !== 'Untitled Conversation') {
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
    firstUserMessageContent: string,
    userId?: string
): Promise<void> {
    // Skip if no message content
    if (!firstUserMessageContent || firstUserMessageContent.trim().length === 0) {
        return;
    }

    const startTime = performance.now();
    let lockAcquired = false;

    try {
        titleLogger.attemptGeneration({ chatId, userId });

        // Try to acquire lock to prevent multiple parallel generation attempts
        const lockStartTime = performance.now();
        // Use exists to check if lock is available before setting
        const lockExists = await cacheService.exists(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
        lockAcquired = !lockExists;
        if (lockAcquired) {
            await cacheService.set(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`, 'locked', { ttl: 30 });
        } else {
            titleLogger.lockAcquisitionFailed({ chatId, userId });
            return;
        }
        const lockDurationMs = Math.round(performance.now() - lockStartTime);

        // Check rate limiting - maximum 10 generation attempts per minute
        const cacheStartTime = performance.now();
        // Since incrementCounter doesn't exist, implement manually with get/set
        let currentAttempts = 0;
        const counterKey = `${TITLE_GENERATION_ATTEMPTS_KEY}:global`;
        const existingCounter = await cacheService.get<number>(counterKey);
        if (existingCounter) {
            currentAttempts = existingCounter + 1;
        } else {
            currentAttempts = 1;
        }
        await cacheService.set(counterKey, currentAttempts, { ttl: 60 });
        const cacheDurationMs = Math.round(performance.now() - cacheStartTime);

        titleLogger.cacheResult({
            chatId,
            hit: false,
            key: `${TITLE_GENERATION_ATTEMPTS_KEY}:global`,
            durationMs: cacheDurationMs,
            userId
        });

        if (currentAttempts && currentAttempts > 10) {
            titleLogger.rateLimitExceeded({ chatId, userId });
            return;
        }

        try {
            // Check if title is still default
            const currentTitle = await getCurrentTitle(chatId, userId);
            if (currentTitle !== 'New Chat' && currentTitle !== 'Untitled Conversation' && currentTitle !== null) {
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
                        content: 'You are a helpful assistant that generates concise, descriptive titles for chat conversations. Create a title that summarizes the main topic or intent of the user message in 5-7 words. Do not use quotes in your response.'
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

            const titleGenerationDurationMs = Math.round(performance.now() - startTime);
            titleLogger.titleGenerated({
                chatId,
                generatedTitle: cleanedTitle,
                durationMs: titleGenerationDurationMs,
                userId
            });

            // Update the title in the database
            await updateTitleInDatabase(chatId, cleanedTitle, userId);
        } finally {
            // Release the lock when done
            if (lockAcquired) {
                await cacheService.delete(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
            }
        }
    } catch (error) {
        const errorDurationMs = Math.round(performance.now() - startTime);
        titleLogger.titleGenerationFailed({
            chatId,
            error: error instanceof Error ? error.message : String(error),
            durationMs: errorDurationMs,
            userId
        });

        // Attempt to set a default title if we failed to generate one
        try {
            const defaultTitle = 'Chat ' + new Date().toLocaleDateString();
            await updateTitleInDatabase(chatId, defaultTitle, userId);
        } catch (fallbackError) {
            // Fallback error can be safely ignored
        } finally {
            // Make sure lock is released even if fallback fails
            if (lockAcquired) {
                await cacheService.delete(`${TITLE_GENERATION_LOCK_KEY}:${chatId}`);
            }
        }
    }
} 