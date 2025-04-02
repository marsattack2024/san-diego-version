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

// Mock Supabase
vi.mock('@/utils/supabase/server', () => {
    const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn()
    };

    return {
        createClient: vi.fn(() => Promise.resolve(mockSupabase))
    };
});

// Now import the actual test dependencies
import { describe, expect, it, beforeEach, afterEach, Mock } from 'vitest';
import { setupLoggerMock } from '../../helpers/mock-logger';
import { triggerTitleGenerationViaApi } from '@/lib/chat/title-service';
import { createClient } from '@/utils/supabase/server';
import { titleLogger } from '@/lib/logger/title-logger';

// Define an interface for our mock client
interface MockSupabaseClient {
    from: Mock;
    select?: Mock;
    eq?: Mock;
    maybeSingle?: Mock;
}

// Get reference to the Supabase mock for manipulating in tests
const mockSupabase = createClient as unknown as Mock;

// Set up logger mocks
setupLoggerMock();

describe('Title Service - API Trigger Conditions', () => {
    const TEST_CHAT_ID = 'test-chat-id';
    const TEST_USER_ID = 'test-user-123';
    const TEST_CONTENT = 'Test message.';
    const TEST_AUTH_TOKEN = 'test-auth-token';

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Setup fetch mock
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: new Headers({ 'Content-Type': 'application/json' })
        }));

        // Mock crypto.randomUUID
        vi.stubGlobal('crypto', {
            randomUUID: () => 'test-uuid-12345678'
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
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
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should log titleExists and NOT attempt generation or fetch if title exists', async () => {
        // Arrange: Mock for existing title case
        mockSupabase().then((client: MockSupabaseClient) => {
            client.maybeSingle?.mockResolvedValueOnce({
                data: { title: 'Existing Title' },
                error: null
            });
        });

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert - Check we queried the correct table
        const client = await mockSupabase.mock.results[0].value as MockSupabaseClient;
        expect(client.from).toHaveBeenCalledWith('sd_chat_sessions');

        // Verify logs
        expect(titleLogger.titleExists).toHaveBeenCalledWith({
            chatId: TEST_CHAT_ID,
            userId: TEST_USER_ID,
            currentTitle: 'Existing Title'
        });

        // Verify generation was stopped
        expect(titleLogger.attemptGeneration).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should proceed with generation for new conversations with low message count', async () => {
        // Setup mockClient chain for both calls
        let callCount = 0;
        const mockClient = {
            from: vi.fn(tableName => {
                callCount++;
                if (callCount === 1) { // First call for sessions
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { title: null },
                            error: null
                        })
                    };
                } else { // Second call for history count
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                // Mock low message count to pass check
                                count: 1,
                                error: null
                            })
                        })
                    };
                }
            })
        };

        mockSupabase.mockResolvedValue(mockClient);

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID, TEST_AUTH_TOKEN);

        // Assert
        expect(mockClient.from).toHaveBeenCalledWith('sd_chat_sessions');
        expect(titleLogger.attemptGeneration).toHaveBeenCalledWith({
            chatId: TEST_CHAT_ID,
            userId: TEST_USER_ID
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should not proceed with generation for conversations with high message count', async () => {
        // Setup mockClient chain for both calls
        let callCount = 0;
        const mockClient = {
            from: vi.fn(tableName => {
                callCount++;
                if (callCount === 1) { // First call for sessions
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { title: null },
                            error: null
                        })
                    };
                } else { // Second call for history count
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                // Mock high message count
                                count: 5,
                                error: null
                            })
                        })
                    };
                }
            })
        };

        mockSupabase.mockResolvedValue(mockClient);

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert
        expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                chatId: TEST_CHAT_ID,
                userId: TEST_USER_ID,
                error: 'Skipping generation: message count 5 > 2'
            })
        );
        expect(titleLogger.attemptGeneration).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
}); 