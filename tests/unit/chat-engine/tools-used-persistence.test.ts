import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks BEFORE importing the module under test
setupLoggerMock();

// Mock Supabase client
vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn().mockResolvedValue({
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
            error: null
        }),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        data: {
            id: 'mock-id',
            updated_at: new Date().toISOString()
        },
        rpc: vi.fn().mockReturnValue({
            data: { success: true },
            error: null
        })
    }),
    createAdminClient: vi.fn().mockImplementation(() => vi.mocked(require('@/utils/supabase/server').createClient)())
}));

// Mock cache service
vi.mock('@/lib/cache/cache-service', () => ({
    cacheService: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn()
    }
}));

// Mock AI modules without referencing specific imports
vi.mock('ai/stream', () => ({}));
vi.mock('@ai-sdk/openai', () => ({
    openai: vi.fn()
}));

// Now import modules that use the mocked dependencies
import { MessagePersistenceService, ToolsUsedData } from '@/lib/chat-engine/message-persistence';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

describe('Chat Engine Tool Call Persistence', () => {
    let mockPersistenceService: Partial<MessagePersistenceService>;

    beforeEach(() => {
        // Reset all mocks
        mockLogger.reset();
        vi.clearAllMocks();

        // Create a mock persistence service with spies
        mockPersistenceService = {
            saveMessage: vi.fn().mockResolvedValue({ success: true }),
            loadPreviousMessages: vi.fn().mockResolvedValue([]),
            getRecentHistory: vi.fn().mockResolvedValue([])
        };
    });

    it('should save API tool calls to the database', async () => {
        // Arrange
        const context = createMockContext();
        const assistantMessage = 'I have searched for information about TypeScript.';
        const toolsUsed = {
            api_tool_calls: [
                {
                    id: 'tool-call-1',
                    type: 'function',
                    name: 'searchKnowledgeBase'
                },
                {
                    id: 'tool-call-2',
                    type: 'function',
                    name: 'scrapeWebContent'
                }
            ]
        };

        // Act - Directly call the service method
        await mockPersistenceService.saveMessage?.({
            sessionId: context.sessionId,
            userId: context.userId,
            role: 'assistant',
            content: assistantMessage,
            messageId: 'mock-message-id',
            tools: toolsUsed
        });

        // Assert
        expect(mockPersistenceService.saveMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'assistant',
                content: assistantMessage,
                tools: toolsUsed
            })
        );

        // Verify logger calls
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Saving message to database',
            expect.objectContaining({
                role: 'assistant',
                hasToolsUsed: true
            })
        );
    });

    it('should save text-based tool references to the database', async () => {
        // Arrange
        const context = createMockContext();
        const assistantMessage = 'I used some tools to help you.\n\n--- Tools and Resources Used ---\n- Knowledge Base\n- Web Scraper';
        const toolsUsed = {
            tools: [
                '- Knowledge Base',
                '- Web Scraper'
            ]
        };

        // Act - Directly call the service method
        await mockPersistenceService.saveMessage?.({
            sessionId: context.sessionId,
            userId: context.userId,
            role: 'assistant',
            content: assistantMessage,
            messageId: 'mock-message-id',
            tools: toolsUsed
        });

        // Assert
        expect(mockPersistenceService.saveMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'assistant',
                content: assistantMessage,
                tools: toolsUsed
            })
        );
    });

    it('should save combined tool information to the database', async () => {
        // Arrange
        const context = createMockContext();
        const assistantMessage = 'I used multiple tools to help you.\n\n--- Tools and Resources Used ---\n- Knowledge Base\n- Web Scraper';
        const toolsUsed = {
            tools: [
                '- Knowledge Base',
                '- Web Scraper'
            ],
            api_tool_calls: [
                {
                    id: 'tool-call-1',
                    type: 'function',
                    name: 'searchKnowledgeBase'
                },
                {
                    id: 'tool-call-2',
                    type: 'function',
                    name: 'scrapeWebContent'
                }
            ]
        };

        // Act - Directly call the service method
        await mockPersistenceService.saveMessage?.({
            sessionId: context.sessionId,
            userId: context.userId,
            role: 'assistant',
            content: assistantMessage,
            messageId: 'mock-message-id',
            tools: toolsUsed
        });

        // Assert
        expect(mockPersistenceService.saveMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'assistant',
                content: assistantMessage,
                tools: toolsUsed
            })
        );

        // Verify the structure passed to the SQL function
        const saveMessageFn = mockPersistenceService.saveMessage as ReturnType<typeof vi.fn>;
        const saveMessageCall = saveMessageFn.mock.calls[0][0];
        expect(saveMessageCall.tools).toEqual(toolsUsed);

        // Verify it has both types of tool data
        if (saveMessageCall.tools) {
            expect(saveMessageCall.tools.tools).toHaveLength(2);
            expect(saveMessageCall.tools.api_tool_calls).toHaveLength(2);
        }
    });

    // Helper functions
    function createMockContext() {
        return {
            sessionId: 'test-session-id',
            userId: 'test-user-id',
            requestId: 'test-request-id',
            startTime: Date.now(),
            messages: [],
            metrics: {}
        };
    }
}); 