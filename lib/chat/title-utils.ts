import { createClient } from '@/utils/supabase/server';
import { titleLogger } from '@/lib/logger/title-logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Clean and validate a title from the AI response
 */
export function cleanTitle(rawTitle: string): string {
    let cleanedTitle = rawTitle.trim().replace(/^["\']|["\']$/g, '');
    if (cleanedTitle.length > 50) {
        cleanedTitle = cleanedTitle.substring(0, 47) + '...';
    }
    if (!cleanedTitle) {
        return 'Chat Summary';
    }
    return cleanedTitle;
}

/**
 * Update the title in the database
 * @param supabase - An authenticated Supabase client instance
 * @param chatId - The ID of the chat session to update
 * @param newTitle - The new title
 * @param userId - The user ID (for logging/context)
 */
export async function updateTitleInDatabase(
    supabase: SupabaseClient,
    chatId: string,
    newTitle: string,
    userId?: string
): Promise<boolean> {
    const startTime = performance.now();
    try {
        const { error } = await supabase
            .from('sd_chat_sessions')
            .update({
                title: newTitle,
                updated_at: new Date().toISOString()
            })
            .eq('id', chatId);

        if (error) {
            titleLogger.titleUpdateResult({
                chatId,
                newTitle,
                success: false,
                userId,
                error: `Supabase DB Error: ${error.message} (Code: ${error.code})`,
                durationMs: Math.round(performance.now() - startTime)
            });
            return false;
        }

        // Invalidate history cache (optional, keep fetch for now)
        try {
            fetch('/api/history/invalidate', { method: 'POST' });
        } catch (cacheError) {
            titleLogger.titleGenerationFailed({
                chatId,
                userId,
                error: `Cache invalidation fetch failed: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
                durationMs: 0
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