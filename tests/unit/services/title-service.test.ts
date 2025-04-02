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
import * as titleUtils from '@/lib/chat/title-utils'; // Import to mock
import * as serverClient from '@/utils/supabase/server'; // Import to mock createClient

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

// Create a mock implementation of fetch
const mockFetch = vi.fn();

describe('Title Service - API Trigger Conditions', () => {
    const TEST_CHAT_ID = 'test-chat-id';
    const TEST_USER_ID = 'test-user-123';
    const TEST_CONTENT = 'Test message.';
    const TEST_AUTH_TOKEN = 'test-auth-token';
    let mockSupabaseClient: any;

    beforeEach(() => {
        // Reset all mocks before each test
        vi.resetAllMocks();

        // Mock the global fetch function
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockClear();

        // Setup mock Supabase client behavior
        mockSupabaseClient = {
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(),
        };
        vi.mocked(serverClient.createClient).mockResolvedValue(mockSupabaseClient);

        // Mock environment variable
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
        // Arrange: Mock for existing title case
        mockSupabaseClient.maybeSingle?.mockResolvedValueOnce({
            data: { title: 'Existing Title' },
            error: null
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
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should proceed with generation for new conversations with low message count', async () => {
        // Mock session data: no existing title or default title
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { title: 'New Conversation' }, error: null });
        // Mock message count: low count (e.g., 1)
        const mockCountResult = { count: 1, error: null };
        mockSupabaseClient.select.mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve(mockCountResult))
        });

        // Mock fetch response
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true })
        });

        // Act
        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        // Assert
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('sd_chat_sessions');
        expect(titleLogger.attemptGeneration).toHaveBeenCalledWith({
            chatId: TEST_CHAT_ID,
            userId: TEST_USER_ID
        });
        // Verify fetch was called once
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // Verify fetch was called with the correct URL and options
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining(`/api/chat/update-title`),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': 'test-secret-123', // Check for the secret header
                    'x-operation-id': expect.any(String),
                }),
                body: JSON.stringify({
                    sessionId: TEST_CHAT_ID,
                    content: TEST_CONTENT, // Ensure content is passed
                    userId: TEST_USER_ID // Ensure userId is passed
                })
            })
        );
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
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should log error and not fetch if INTERNAL_API_SECRET is not set', async () => {
        // Mock conditions where generation should proceed
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        const mockCountResult = { count: 1, error: null };
        mockSupabaseClient.select.mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve(mockCountResult))
        });

        // Unset the mocked environment variable
        delete process.env.INTERNAL_API_SECRET;
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { }); // Suppress console.error

        await triggerTitleGenerationViaApi(TEST_CHAT_ID, TEST_CONTENT, TEST_USER_ID);

        expect(titleLogger.titleGenerationFailed).toHaveBeenCalledWith(expect.objectContaining({
            error: 'INTERNAL_API_SECRET is not configured.'
        }));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('INTERNAL_API_SECRET environment variable is not set'));
        expect(mockFetch).not.toHaveBeenCalled();

        errorSpy.mockRestore(); // Restore console.error
    });
}); 