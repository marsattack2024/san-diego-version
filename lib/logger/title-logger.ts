import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from './constants';

/**
 * Specialized logger for title generation operations
 * Provides consistent logging patterns for all title-related operations
 */
export const titleLogger = {
    attemptGeneration: ({ chatId }: { chatId: string }) => {
        edgeLogger.info('Attempting title generation', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'generate_attempt',
            chatId
        });
    },

    titleGenerated: ({ chatId, generatedTitle }: {
        chatId: string,
        generatedTitle: string
    }) => {
        edgeLogger.info('Title generated successfully', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'generation_success',
            chatId,
            generatedTitle
        });
    },

    titleGenerationFailed: ({ chatId, error }: {
        chatId: string,
        error: string
    }) => {
        edgeLogger.error('Title generation failed', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'generation_error',
            chatId,
            error
        });
    },

    titleUpdateResult: ({ chatId, newTitle, success, error }: {
        chatId: string,
        newTitle: string,
        success: boolean,
        error?: string
    }) => {
        if (success) {
            edgeLogger.info('Title updated in database', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'db_update_success',
                chatId,
                newTitle
            });
        } else {
            edgeLogger.error('Failed to update title in database', {
                category: LOG_CATEGORIES.CHAT,
                operation: 'db_update_error',
                chatId,
                error
            });
        }
    }
};
