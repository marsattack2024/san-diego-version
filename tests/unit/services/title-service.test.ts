import { vi } from 'vitest';

// Mock title-logger
vi.mock('@/lib/logger/title-logger', () => ({
    titleLogger: {
        attemptGeneration: vi.fn(),
        titleGenerated: vi.fn(),
        titleGenerationFailed: vi.fn(),
        titleUpdateResult: vi.fn(),
        rateLimitExceeded: vi.fn(),
        lockAcquisitionFailed: vi.fn(),
        titleExists: vi.fn(),
        cacheResult: vi.fn()
    }
}));

// Import to get properly typed mocks
import { titleLogger } from '@/lib/logger/title-logger';

// Setup the mock for utils/supabase/server
vi.mock('@/utils/supabase/server', () => {
    // We'll set up a factory function to create a mock that's returned by createClient
    const createMockClient = () => ({
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
    });

    return {
        createClient: vi.fn().mockImplementation(() => {
            return Promise.resolve(createMockClient());
        })
    };
});

// Now import the actual test dependencies after mocking
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { setupLoggerMock } from '../../helpers/mock-logger';
import { triggerTitleGenerationViaApi } from '@/lib/chat/title-service';
import { createClient } from '@/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// Set up logger mocks
setupLoggerMock();

describe('Title Service - API Trigger Conditions', () => {
    const TEST_CHAT_ID = 'test-chat-id';
    const TEST_USER_ID = 'test-user-123';
    const TEST_CONTENT = 'Test message.';

    // Create a mock implementation of fetch
    const mockFetch = vi.fn();

    beforeEach(() => {
        // Reset all mocks before each test
        vi.resetAllMocks();

        // Mock the global fetch function
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
            text: () => Promise.resolve('Success')
        });

        // Mock environment variables
        process.env.INTERNAL_API_SECRET = 'test-secret-123';
        process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals(); // Clean up stubbed fetch
    });

    it('should skip generation when given empty content', async () => {
        // Act - Empty content
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, '', TEST_USER_ID);

        // Assert
        expect(createClient).not.toHaveBeenCalled();
        expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_CHAT_ID,
                userId: TEST_USER_ID,
                error: 'Skipping trigger: No message content provided'
            })
        );
        expect(titleLogger.attemptGeneration).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should log titleExists and NOT attempt generation or fetch if title exists', async () => {
        // Setup mock responses
        const mockSupabaseClient = {
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { title: 'Existing Title' },
                error: null
            })
        };

        // Mock the createClient function specifically for this test - add type assertion
        vi.mocked(createClient).mockResolvedValue(mockSupabaseClient as unknown as SupabaseClient);

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('sd_chat_sessions');
        expect(titleLogger.titleExists).toHaveBeenCalledWith({
            chatId: TEST_CHAT_ID,
            userId: TEST_USER_ID,
            currentTitle: 'Existing Title'
        });

        // Verify generation was stopped
        expect(titleLogger.attemptGeneration).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should proceed with generation for new conversations with low message count', async () => {
        // Setup the first Supabase call for session data
        const mockSupabaseClient = {
            from: vi.fn((table) => {
                if (table === 'sd_chat_sessions') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { title: 'New Conversation' }, // Default title that should be replaced
                            error: null
                        })
                    };
                } else if (table === 'sd_chat_histories') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                // Low message count to allow generation
                                count: 1,
                                error: null
                            })
                        })
                    };
                }
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn()
                };
            })
        };

        // Mock the createClient function for this test - add type assertion
        vi.mocked(createClient).mockResolvedValue(mockSupabaseClient as unknown as SupabaseClient);

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert - Check we called the correct APIs
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('sd_chat_sessions');
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('sd_chat_histories');

        // Check that generation was attempted
        expect(titleLogger.attemptGeneration).toHaveBeenCalledWith({
            chatId: TEST_CHAT_ID,
            userId: TEST_USER_ID
        });

        // Verify fetch was called correctly
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining(`/api/chat/update-title`),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': 'test-secret-123',
                }),
                body: expect.stringContaining(TEST_CHAT_ID)
            })
        );
    });

    it('should not proceed with generation for conversations with high message count', async () => {
        // Setup mock client with high message count
        const mockSupabaseClient = {
            from: vi.fn((table) => {
                if (table === 'sd_chat_sessions') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { title: null }, // No title
                            error: null
                        })
                    };
                } else if (table === 'sd_chat_histories') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                // High message count to prevent generation
                                count: 5,
                                error: null
                            })
                        })
                    };
                }
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn()
                };
            })
        };

        // Mock the createClient function for this test - add type assertion
        vi.mocked(createClient).mockResolvedValue(mockSupabaseClient as unknown as SupabaseClient);

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert
        expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_CHAT_ID,
                userId: TEST_USER_ID,
                error: expect.stringContaining('Skipping generation: message count 5 > 2')
            })
        );

        // Verify generation was not attempted
        expect(titleLogger.attemptGeneration).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should log error and not fetch if INTERNAL_API_SECRET is not set', async () => {
        // Setup mock for the Supabase client to allow generation to proceed
        const mockSupabaseClient = {
            from: vi.fn((table) => {
                if (table === 'sd_chat_sessions') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { title: 'New Conversation' },
                            error: null
                        })
                    };
                } else if (table === 'sd_chat_histories') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                count: 1, // Low message count to allow generation
                                error: null
                            })
                        })
                    };
                }
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn()
                };
            })
        };

        // Mock the createClient function for this test - add type assertion
        vi.mocked(createClient).mockResolvedValue(mockSupabaseClient as unknown as SupabaseClient);

        // Unset the environment variable
        delete process.env.INTERNAL_API_SECRET;

        // Suppress console.error
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert - should detect missing secret
        expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'INTERNAL_API_SECRET is not configured.'
            })
        );

        // Should log to console
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('INTERNAL_API_SECRET environment variable is not set')
        );

        // Should not attempt fetch
        expect(mockFetch).not.toHaveBeenCalled();

        // Cleanup
        errorSpy.mockRestore();
    });
}); 