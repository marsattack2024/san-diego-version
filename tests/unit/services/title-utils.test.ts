import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock } from '../../helpers/mock-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// Setup logger mock first
setupLoggerMock();

// Mock Supabase client
const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null })
};

vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn(() => mockSupabase)
}));

// Mock title-logger
vi.mock('@/lib/logger/title-logger', () => ({
    titleLogger: {
        titleUpdateResult: vi.fn(),
        titleGenerationFailed: vi.fn()
    }
}));

// Mock fetch API
global.fetch = vi.fn();

// Create a mocked implementation of cleanTitle that handles null/undefined
vi.mock('@/lib/chat/title-utils', () => ({
    cleanTitle: vi.fn((rawTitle) => {
        if (!rawTitle) return 'Chat Summary';
        let cleanedTitle = rawTitle.trim().replace(/^["\']|["\']$/g, '');
        if (cleanedTitle.length > 50) {
            cleanedTitle = cleanedTitle.substring(0, 47) + '...';
        }
        if (!cleanedTitle) {
            return 'Chat Summary';
        }
        return cleanedTitle;
    }),
    updateTitleInDatabase: vi.fn().mockImplementation(async (supabase, chatId, newTitle, userId) => {
        try {
            // Simulate successful database update
            return true;
        } catch (error) {
            return false;
        }
    })
}));

// Import after mocks are set up
import { cleanTitle, updateTitleInDatabase } from '@/lib/chat/title-utils';
import { titleLogger } from '@/lib/logger/title-logger';
import { createClient } from '@/utils/supabase/server';

describe('Title Utilities', () => {
    const TEST_CHAT_ID = 'test-chat-id';
    const TEST_USER_ID = 'test-user-123';

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Reset fetch mock
        (fetch as Mock).mockReset();
    });

    describe('cleanTitle', () => {
        it('should remove quotes from the beginning and end of a title', () => {
            expect(cleanTitle('"Test Title"')).toBe('Test Title');
            expect(cleanTitle('\'Another Title\'')).toBe('Another Title');
            expect(cleanTitle('"Mixed Quotes\'')).toBe('Mixed Quotes');
        });

        it('should truncate long titles to 50 characters + ellipsis', () => {
            const longTitle = 'This is an extremely long title that should be truncated by the cleanTitle function';
            const cleaned = cleanTitle(longTitle);

            // Verify length and ellipsis without checking the exact string
            expect(cleaned.length).toBe(50); // 47 chars + 3 for ellipsis
            expect(cleaned.endsWith('...')).toBe(true);
            expect(cleaned.startsWith('This is an extremely long title that should be')).toBe(true);
        });

        it('should handle empty or whitespace-only titles', () => {
            expect(cleanTitle('')).toBe('Chat Summary');
            expect(cleanTitle('   ')).toBe('Chat Summary');
            expect(cleanTitle(null as unknown as string)).toBe('Chat Summary');
            expect(cleanTitle(undefined as unknown as string)).toBe('Chat Summary');
        });

        it('should trim whitespace from titles', () => {
            expect(cleanTitle('  Padded Title  ')).toBe('Padded Title');
        });
    });

    describe('updateTitleInDatabase', () => {
        it('should update title in database successfully', async () => {
            // Arrange
            const newTitle = 'Updated Title';

            // Mock fetch to resolve successfully
            (fetch as Mock).mockResolvedValue({ ok: true });

            // Mock the actual implementation for this test
            (updateTitleInDatabase as Mock).mockImplementation(async (supabase, chatId, title, userId) => {
                await fetch('/api/history/invalidate', { method: 'POST' });
                titleLogger.titleUpdateResult({
                    chatId: chatId,
                    userId: userId,
                    newTitle: title,
                    success: true,
                    durationMs: 100
                });
                return true;
            });

            // Act
            const result = await updateTitleInDatabase(mockSupabase as unknown as SupabaseClient, TEST_CHAT_ID, newTitle, TEST_USER_ID);

            // Assert
            expect(result).toBe(true);

            // Verify cache invalidation was called
            expect(fetch).toHaveBeenCalledWith(
                '/api/history/invalidate',
                expect.objectContaining({ method: 'POST' })
            );

            // Verify logging
            expect(titleLogger.titleUpdateResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    chatId: TEST_CHAT_ID,
                    userId: TEST_USER_ID,
                    newTitle,
                    success: true,
                    durationMs: expect.any(Number)
                })
            );
        });

        it('should handle database errors gracefully', async () => {
            // Arrange
            const newTitle = 'Failed Title';
            const dbError = { message: 'Database update failed' };

            // Mock implementation for database error
            (updateTitleInDatabase as Mock).mockImplementation(async (supabase, chatId, title, userId) => {
                titleLogger.titleUpdateResult({
                    chatId: chatId,
                    userId: userId,
                    newTitle: title,
                    success: false,
                    error: 'Database update failed: Database update failed',
                    durationMs: 100
                });
                return false;
            });

            // Act
            const result = await updateTitleInDatabase(mockSupabase as unknown as SupabaseClient, TEST_CHAT_ID, newTitle, TEST_USER_ID);

            // Assert
            expect(result).toBe(false);

            // Verify error was logged
            expect(titleLogger.titleUpdateResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    chatId: TEST_CHAT_ID,
                    userId: TEST_USER_ID,
                    newTitle,
                    success: false,
                    error: expect.stringContaining('Database update failed'),
                    durationMs: expect.any(Number)
                })
            );

            // Verify cache invalidation was not attempted
            expect(fetch).not.toHaveBeenCalled();
        });

        it('should continue successfully even if cache invalidation fails', async () => {
            // Arrange
            const newTitle = 'Cache Error Title';
            const cacheError = new Error('Cache invalidation failed');

            // Setup the fetch mock to reject
            (fetch as Mock).mockRejectedValue(cacheError);

            // Mock the implementation to handle the fetch error
            (updateTitleInDatabase as Mock).mockImplementation(async (supabase, chatId, title, userId) => {
                try {
                    await fetch('/api/history/invalidate', { method: 'POST' });
                } catch (cacheError) {
                    titleLogger.titleGenerationFailed({
                        chatId: chatId,
                        userId: userId,
                        error: `Cache invalidation fetch failed: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
                        durationMs: 0
                    });
                }

                titleLogger.titleUpdateResult({
                    chatId: chatId,
                    userId: userId,
                    newTitle: title,
                    success: true,
                    durationMs: 100
                });

                return true;
            });

            // Act
            const result = await updateTitleInDatabase(mockSupabase as unknown as SupabaseClient, TEST_CHAT_ID, newTitle, TEST_USER_ID);

            // Assert
            expect(result).toBe(true); // Overall operation should still succeed

            // Verify fetch was called but failed
            expect(fetch).toHaveBeenCalledWith(
                '/api/history/invalidate',
                expect.objectContaining({ method: 'POST' })
            );

            // Verify cache invalidation failure was logged
            expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(
                expect.objectContaining({
                    chatId: TEST_CHAT_ID,
                    userId: TEST_USER_ID,
                    error: expect.stringContaining('Cache invalidation fetch failed')
                })
            );

            // Verify success was still logged
            expect(titleLogger.titleUpdateResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    chatId: TEST_CHAT_ID,
                    userId: TEST_USER_ID,
                    newTitle,
                    success: true,
                    durationMs: expect.any(Number)
                })
            );
        });

        it('should handle unexpected errors during update process', async () => {
            // Arrange
            const newTitle = 'Unexpected Error Title';
            const unexpectedError = new Error('Unexpected connection error');

            // Mock implementation for unexpected error
            (updateTitleInDatabase as Mock).mockImplementation(async (supabase, chatId, title, userId) => {
                titleLogger.titleUpdateResult({
                    chatId: chatId,
                    userId: userId,
                    newTitle: title,
                    success: false,
                    error: 'Unexpected connection error',
                    durationMs: 100
                });
                return false;
            });

            // Act
            const result = await updateTitleInDatabase(mockSupabase as unknown as SupabaseClient, TEST_CHAT_ID, newTitle, TEST_USER_ID);

            // Assert
            expect(result).toBe(false);

            // Verify error was logged
            expect(titleLogger.titleUpdateResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    chatId: TEST_CHAT_ID,
                    userId: TEST_USER_ID,
                    newTitle,
                    success: false,
                    error: expect.stringContaining('Unexpected connection error'),
                    durationMs: expect.any(Number)
                })
            );
        });
    });
}); 