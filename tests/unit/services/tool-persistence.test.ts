import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks BEFORE importing the module under test
setupLoggerMock();

// Mock Supabase client - using more sophisticated mock implementation
const mockRpc = vi.fn().mockReturnValue({
    data: { success: true },
    error: null
});

const mockInsert = vi.fn().mockReturnValue({
    error: null
});

const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: mockInsert,
    upsert: vi.fn().mockReturnValue({ error: null })
});

const mockSupabaseClient = {
    from: mockFrom,
    rpc: mockRpc
};

// Mock Supabase client creation
vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn().mockImplementation(() => mockSupabaseClient),
    createAdminClient: vi.fn().mockImplementation(() => mockSupabaseClient)
}));

// Now import modules that use the mocked dependencies
import { MessagePersistenceService, ToolsUsedData } from '@/lib/chat-engine/message-persistence';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createClient } from '@/utils/supabase/server';

describe('Tool Usage Persistence', () => {
    let persistenceService: MessagePersistenceService;

    beforeEach(() => {
        // Reset mocks before each test
        mockLogger.reset();
        vi.clearAllMocks();

        // Create persistence service
        persistenceService = new MessagePersistenceService({
            operationName: 'test_persistence',
            throwErrors: false
        });
    });

    it('should save API tool calls to the database via RPC', async () => {
        // Arrange
        const sessionId = 'test-session-id';
        const userId = 'test-user-id';
        const messageId = 'test-message-id';
        const content = 'This is a test message with tool usage.';

        const toolsUsed: ToolsUsedData = {
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

        // Act
        await persistenceService.saveMessage({
            sessionId,
            userId,
            role: 'assistant',
            content,
            messageId,
            tools: toolsUsed
        });

        // Assert
        expect(mockRpc).toHaveBeenCalledWith(
            'save_message_and_update_session',
            expect.objectContaining({
                p_session_id: sessionId,
                p_role: 'assistant',
                p_content: content,
                p_user_id: userId,
                p_message_id: messageId,
                p_tools_used: toolsUsed
            })
        );

        // Verify logging
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Saving message to database',
            expect.objectContaining({
                sessionId,
                role: 'assistant',
                userId,
                messageId,
                contentLength: content.length,
                hasToolsUsed: true
            })
        );
    });

    it('should save text-based tool references to the database', async () => {
        // Arrange
        const sessionId = 'test-session-id';
        const userId = 'test-user-id';
        const messageId = 'test-message-id';
        const content = 'This is a test message with tool usage listed at the end.\n\n--- Tools and Resources Used ---\n- Knowledge Base\n- Web Scraper';

        const toolsUsed: ToolsUsedData = {
            tools: [
                '- Knowledge Base',
                '- Web Scraper'
            ]
        };

        // Act
        await persistenceService.saveMessage({
            sessionId,
            userId,
            role: 'assistant',
            content,
            messageId,
            tools: toolsUsed
        });

        // Assert
        expect(mockRpc).toHaveBeenCalledWith(
            'save_message_and_update_session',
            expect.objectContaining({
                p_session_id: sessionId,
                p_role: 'assistant',
                p_tools_used: toolsUsed
            })
        );
    });

    it('should save combined tool usage data to the database', async () => {
        // Arrange
        const sessionId = 'test-session-id';
        const userId = 'test-user-id';
        const messageId = 'test-message-id';
        const content = 'This is a test message with combined tool usage.';

        const toolsUsed: ToolsUsedData = {
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

        // Act
        await persistenceService.saveMessage({
            sessionId,
            userId,
            role: 'assistant',
            content,
            messageId,
            tools: toolsUsed
        });

        // Assert
        expect(mockRpc).toHaveBeenCalledWith(
            'save_message_and_update_session',
            expect.objectContaining({
                p_tools_used: toolsUsed
            })
        );

        // Verify correct structure of the tools_used data
        const rpcArgs = mockRpc.mock.calls[0][1];
        expect(rpcArgs.p_tools_used).toEqual(toolsUsed);
        expect(rpcArgs.p_tools_used.tools).toHaveLength(2);
        expect(rpcArgs.p_tools_used.api_tool_calls).toHaveLength(2);
    });

    it('should handle RPC failures and fall back to direct insert', async () => {
        // Arrange
        const sessionId = 'test-session-id';
        const userId = 'test-user-id';
        const messageId = 'test-message-id';
        const content = 'This is a test message.';

        const toolsUsed: ToolsUsedData = {
            api_tool_calls: [
                {
                    id: 'tool-call-1',
                    type: 'function',
                    name: 'testTool'
                }
            ]
        };

        // Mock RPC failure for this test
        mockRpc.mockReturnValueOnce({
            data: null,
            error: { message: 'RPC failure', code: 'TEST_ERROR' }
        });

        // Act
        const result = await persistenceService.saveMessage({
            sessionId,
            userId,
            role: 'assistant',
            content,
            messageId,
            tools: toolsUsed
        });

        // Assert
        expect(mockRpc).toHaveBeenCalled();
        expect(mockFrom).toHaveBeenCalledWith('sd_chat_histories');
        expect(mockInsert).toHaveBeenCalledWith({
            id: messageId,
            session_id: sessionId,
            role: 'assistant',
            content,
            user_id: userId,
            tools_used: toolsUsed
        });

        // Verify logging
        expect(mockLogger.error).toHaveBeenCalledWith(
            'RPC failed to save message',
            expect.objectContaining({
                sessionId,
                messageId,
                error: 'RPC failure'
            })
        );
    });
}); 