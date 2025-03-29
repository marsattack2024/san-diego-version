import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '../../helpers/mock-logger';
import { createMockSupabaseClient } from '../../helpers/mock-clients';

// Set up mocks BEFORE importing modules
setupLoggerMock();

// Mock Vercel AI SDK instead of OpenAI
vi.mock('ai', () => {
    const mockGenerateText = vi.fn().mockResolvedValue({
        text: 'Generated Title Example'
    });

    return {
        generateText: mockGenerateText
    };
});

vi.mock('@ai-sdk/openai', () => {
    const mockOpenai = vi.fn().mockReturnValue('gpt-3.5-turbo-model-reference');

    return {
        openai: mockOpenai
    };
});

// Mock Supabase client
vi.mock('../../../utils/supabase/server', () => {
    // Create mock Supabase client with configurable responses
    const mockSupabase = {
        from: vi.fn().mockImplementation((table) => {
            return {
                select: vi.fn().mockImplementation(() => ({
                    eq: vi.fn().mockImplementation(() => ({
                        single: vi.fn().mockResolvedValue({
                            data: { title: null },
                            error: null
                        })
                    }))
                })),
                update: vi.fn().mockImplementation(() => ({
                    eq: vi.fn().mockResolvedValue({
                        data: null,
                        error: null
                    })
                }))
            };
        })
    };

    return {
        createClient: vi.fn().mockResolvedValue(mockSupabase)
    };
});

// Mock cache service
vi.mock('../../../lib/cache/cache-service', () => {
    return {
        cacheService: {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue('OK'),
            delete: vi.fn().mockResolvedValue(1),
            exists: vi.fn().mockResolvedValue(false)
        }
    };
});

// Mock fetch for cache invalidation
global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({})
});

// Import after mocks
import { generateAndSaveChatTitle } from '../../../lib/chat/title-service';
import { cacheService } from '../../../lib/cache/cache-service';
import { createClient } from '../../../utils/supabase/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

describe('Title Service', () => {
    const chatId = 'test-chat-id';
    const userId = '5c80df74-1e2b-4435-89eb-b61b740120e9';
    const userMessage = 'How do I improve my JavaScript skills?';

    let mockSupabase: any;
    let mockSelect: any;
    let mockUpdate: any;
    let mockSingleResult: any;
    let mockUpdateResult: any;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        mockLogger.reset();

        // Set up necessary environment variables
        process.env.OPENAI_API_KEY = 'test-key';

        // Setup default mock responses
        mockSingleResult = { data: { title: null }, error: null };
        mockUpdateResult = { data: null, error: null };

        // Setup mock implementation
        mockSelect = vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockImplementation(() => Promise.resolve(mockSingleResult))
            }))
        }));

        mockUpdate = vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => Promise.resolve(mockUpdateResult))
        }));

        mockSupabase = {
            from: vi.fn().mockImplementation((table) => ({
                select: mockSelect,
                update: mockUpdate
            }))
        };

        // Override createClient mock
        vi.mocked(createClient).mockResolvedValue(mockSupabase);
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
    });

    it('should generate a title from user message', async () => {
        // Act
        await generateAndSaveChatTitle(chatId, userMessage, userId);

        // Assert
        // Verify we called openai with the right model
        expect(openai).toHaveBeenCalledWith('gpt-3.5-turbo');

        // Verify we called generateText with the right parameters
        expect(generateText).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-3.5-turbo-model-reference',
                messages: expect.arrayContaining([
                    expect.objectContaining({ role: 'system' }),
                    expect.objectContaining({
                        role: 'user',
                        content: userMessage
                    })
                ]),
                maxTokens: 30,
                temperature: 0.7
            })
        );

        // Check that we called the right Supabase methods
        expect(mockSupabase.from).toHaveBeenCalledWith('sd_chat_sessions');
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Generated Title Example',
                updated_at: expect.any(String)
            })
        );

        // Check logging
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Attempting title generation'),
            expect.objectContaining({
                category: 'chat',
                chatId
            })
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Title generated successfully'),
            expect.objectContaining({
                category: 'chat',
                chatId,
                titlePreview: expect.any(String),
                durationMs: expect.any(Number)
            })
        );
    });

    it('should handle API errors gracefully', async () => {
        // Arrange
        const openaiError = new Error('API Error');
        vi.mocked(generateText).mockRejectedValueOnce(openaiError);

        // Act
        await generateAndSaveChatTitle(chatId, userMessage, userId);

        // Assert
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Title generation failed'),
            expect.objectContaining({
                category: 'chat',
                chatId,
                error: openaiError.message,
                durationMs: expect.any(Number),
                important: true
            })
        );

        // Check that we tried to update with a fallback title
        expect(mockUpdate).toHaveBeenCalled();
        expect(mockUpdate.mock.calls[0][0].title).toMatch(/Chat /); // Fallback title format
    });

    it('should check for existing title before generation', async () => {
        // Arrange - mock existing title
        mockSingleResult = { data: { title: 'Existing Title' }, error: null };

        // Act
        await generateAndSaveChatTitle(chatId, userMessage, userId);

        // Assert
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Title already exists'),
            expect.objectContaining({
                category: 'chat',
                chatId,
                titlePreview: 'Existing Title'
            })
        );

        // Check that we didn't call OpenAI
        expect(generateText).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
        // Arrange
        mockUpdateResult = { data: null, error: new Error('Database Error') };

        // Act
        await generateAndSaveChatTitle(chatId, userMessage, userId);

        // Assert
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to update title in database'),
            expect.objectContaining({
                category: 'chat',
                chatId,
                error: expect.stringContaining('Database'),
                important: true
            })
        );
    });

    it('should respect rate limits', async () => {
        // Arrange - simulate rate limit reached by returning high count
        vi.mocked(cacheService.get).mockResolvedValue(11);

        // Act
        await generateAndSaveChatTitle(chatId, userMessage, userId);

        // Assert
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Title generation rate limit exceeded'),
            expect.objectContaining({
                category: 'chat',
                chatId,
                important: true
            })
        );

        // Check that we didn't call the AI SDK
        expect(generateText).not.toHaveBeenCalled();
    });

    it('should handle lock acquisition failure', async () => {
        // Arrange - mock lock exists (already acquired)
        vi.mocked(cacheService.exists).mockResolvedValue(true);

        // Act
        await generateAndSaveChatTitle(chatId, userMessage, userId);

        // Assert
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Title generation lock acquisition failed'),
            expect.objectContaining({
                category: 'chat',
                chatId
            })
        );

        // Check that we didn't call the AI SDK
        expect(generateText).not.toHaveBeenCalled();
    });

    it('should complete title generation within acceptable time', async () => {
        // Arrange
        vi.useFakeTimers();
        const startTime = Date.now();

        // Act
        const promise = generateAndSaveChatTitle(chatId, userMessage, userId);
        vi.advanceTimersByTime(500); // Simulate 500ms passing
        await promise;
        const endTime = Date.now();

        // Assert
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

        // Restore real timers
        vi.useRealTimers();
    });
}); 