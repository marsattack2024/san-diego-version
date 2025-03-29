import { edgeLogger } from './edge-logger';
import { LOG_CATEGORIES } from './constants';

// Performance thresholds for title generation
const TITLE_THRESHOLDS = {
    SLOW_OPERATION: 2000,    // 2 seconds (triggers level=warn, slow=true)
    IMPORTANT_THRESHOLD: 5000 // Mark important=true if durationMs > 5000
};

// Mask user ID for logging
const maskUserId = (userId: string): string => {
    if (!userId) return 'unknown';
    return userId.substring(0, 4) + '...' + userId.substring(userId.length - 4);
};

/**
 * Specialized logger for title generation operations
 * Provides consistent logging patterns for all title-related operations
 */
export const titleLogger = {
    attemptGeneration: ({ chatId, userId }: { chatId: string; userId?: string }) => {
        edgeLogger.info('Attempting title generation', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_attempt',
            chatId,
            userId: userId ? maskUserId(userId) : undefined
        });
    },

    titleGenerated: ({ chatId, generatedTitle, durationMs, userId }: {
        chatId: string,
        generatedTitle: string,
        durationMs: number,
        userId?: string
    }) => {
        const isSlow = durationMs > TITLE_THRESHOLDS.SLOW_OPERATION;
        const isImportant = durationMs > TITLE_THRESHOLDS.IMPORTANT_THRESHOLD;

        if (isSlow) {
            edgeLogger.warn('Title generated successfully', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_success',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                titlePreview: generatedTitle.substring(0, 30) + (generatedTitle.length > 30 ? '...' : ''),
                durationMs,
                slow: isSlow,
                important: isImportant
            });
        } else {
            edgeLogger.info('Title generated successfully', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_success',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                titlePreview: generatedTitle.substring(0, 30) + (generatedTitle.length > 30 ? '...' : ''),
                durationMs,
                slow: isSlow,
                important: isImportant
            });
        }
    },

    titleGenerationFailed: ({ chatId, error, durationMs, userId }: {
        chatId: string,
        error: string,
        durationMs: number,
        userId?: string
    }) => {
        edgeLogger.error('Title generation failed', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_generation_error',
            chatId,
            userId: userId ? maskUserId(userId) : undefined,
            error,
            durationMs,
            important: true
        });
    },

    titleUpdateResult: ({ chatId, newTitle, success, error, durationMs, userId }: {
        chatId: string,
        newTitle: string,
        success: boolean,
        error?: string,
        durationMs: number,
        userId?: string
    }) => {
        if (success) {
            const isSlow = durationMs > TITLE_THRESHOLDS.SLOW_OPERATION;
            const isImportant = durationMs > TITLE_THRESHOLDS.IMPORTANT_THRESHOLD;

            if (isSlow) {
                edgeLogger.warn('Title updated in database', {
                    category: LOG_CATEGORIES.CHAT,
                    operation: 'title_db_update_success',
                    chatId,
                    userId: userId ? maskUserId(userId) : undefined,
                    titlePreview: newTitle.substring(0, 30) + (newTitle.length > 30 ? '...' : ''),
                    durationMs,
                    slow: isSlow,
                    important: isImportant
                });
            } else {
                edgeLogger.info('Title updated in database', {
                    category: LOG_CATEGORIES.CHAT,
                    operation: 'title_db_update_success',
                    chatId,
                    userId: userId ? maskUserId(userId) : undefined,
                    titlePreview: newTitle.substring(0, 30) + (newTitle.length > 30 ? '...' : ''),
                    durationMs,
                    slow: isSlow,
                    important: isImportant
                });
            }
        } else {
            edgeLogger.error('Failed to update title in database', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_db_update_error',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                error,
                durationMs,
                important: true
            });
        }
    },

    rateLimitExceeded: ({ chatId, userId }: { chatId: string; userId?: string }) => {
        edgeLogger.warn('Title generation rate limit exceeded', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_rate_limit',
            chatId,
            userId: userId ? maskUserId(userId) : undefined,
            important: true
        });
    },

    lockAcquisitionFailed: ({ chatId, userId }: { chatId: string; userId?: string }) => {
        edgeLogger.warn('Title generation lock acquisition failed', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_lock_failed',
            chatId,
            userId: userId ? maskUserId(userId) : undefined,
            important: false
        });
    },

    titleExists: ({ chatId, currentTitle, userId }: {
        chatId: string;
        currentTitle: string;
        userId?: string
    }) => {
        edgeLogger.info('Title already exists for chat', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'title_exists',
            chatId,
            userId: userId ? maskUserId(userId) : undefined,
            titlePreview: currentTitle.substring(0, 30) + (currentTitle.length > 30 ? '...' : ''),
            important: false
        });
    },

    cacheResult: ({ chatId, hit, key, durationMs, userId }: {
        chatId: string;
        hit: boolean;
        key: string;
        durationMs: number;
        userId?: string;
    }) => {
        if (hit) {
            edgeLogger.info('Title generation cache operation', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'cache_hit',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                key,
                hit,
                durationMs,
                important: false
            });
        } else {
            edgeLogger.warn('Title generation cache operation', {
                category: LOG_CATEGORIES.SYSTEM,
                operation: 'cache_miss',
                chatId,
                userId: userId ? maskUserId(userId) : undefined,
                key,
                hit,
                durationMs,
                important: true // Cache misses are important to track
            });
        }
    }
};
