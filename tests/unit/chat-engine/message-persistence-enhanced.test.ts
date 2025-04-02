import { describe, expect, it, beforeEach, vi, Mock, afterEach } from 'vitest';

// Import logger mock before any module is loaded
import { setupLoggerMock } from '../../helpers/mock-logger';
const mockLogger = setupLoggerMock();

// Mock the supabase client before importing any module that uses it
vi.mock('@/utils/supabase/server', () => {
    // Create a mock object that will be returned by both client types
    const mockSupabaseClient = {
        rpc: vi.fn(),
        from: vi.fn(),
        insert: vi.fn()
    };

    return {
        createClient: vi.fn().mockResolvedValue(mockSupabaseClient),
        createAdminClient: vi.fn().mockResolvedValue(mockSupabaseClient)
    };
});

// Mock crypto functions
vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('mock-uuid')
});

// Now import the module under test
import { MessagePersistenceService, ToolsUsedData } from '@/lib/chat-engine/message-persistence';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createClient, createAdminClient } from '@/utils/supabase/server';

describe('Enhanced Message Persistence Service', () => {
    let persistenceService: MessagePersistenceService;
    let mockRpc: Mock;
    let mockFrom: Mock;
    let mockInsert: Mock;
    let mockReturningThis: any;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        mockLogger.reset();

        // Setup function chain mocks
        mockRpc = vi.fn();
        mockFrom = vi.fn();
        mockInsert = vi.fn();
        mockReturningThis = { returning: vi.fn().mockReturnThis() };

        // Configure chain mocks
        mockFrom.mockReturnValue({
            insert: mockInsert,
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis()
        });

        mockInsert.mockReturnValue(mockReturningThis);
        mockReturningThis.returning?.mockReturnThis();

        // Configure successful RPC response
        mockRpc.mockResolvedValue({
            data: { success: true, id: 'mock-message-id' },
            error: null
        });

        // Configure the mocked client
        const mockSupabaseClient = {
            rpc: mockRpc,
            from: mockFrom,
            insert: mockInsert
        };

        // Update the mock implementation to return our configured client
        (createClient as unknown as Mock).mockResolvedValue(mockSupabaseClient);
        (createAdminClient as unknown as Mock).mockResolvedValue(mockSupabaseClient);

        // Create service instance
        persistenceService = new MessagePersistenceService({
            operationName: 'test_persistence'
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('saveUserMessage', () => {
        it('should successfully save a user message', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const content = 'This is a test user message';

            // Mock saveMessage method for successful save
            vi.spyOn(persistenceService, 'saveMessage').mockResolvedValueOnce({
                success: true,
                messageId: 'test-message-id'
            });

            // Act
            const result = await persistenceService.saveUserMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-message-id');

            // Verify saveMessage was called with correct parameters
            expect(persistenceService.saveMessage).toHaveBeenCalledWith({
                sessionId,
                userId,
                role: 'user',
                content,
                messageId: expect.any(String)
            });
        });

        it('should handle and format object content properly', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const content = { text: 'Complex object content', metadata: { key: 'value' } };

            // Mock saveMessage method
            vi.spyOn(persistenceService, 'saveMessage').mockResolvedValueOnce({
                success: true,
                messageId: 'test-message-id'
            });

            // Act
            const result = await persistenceService.saveUserMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(true);

            // Check content was properly stringified
            expect(persistenceService.saveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: JSON.stringify(content)
                })
            );
        });

        it('should return early if user ID is missing', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const content = 'Test message without user ID';

            // Mock saveMessage to verify it's not called
            const saveMessageSpy = vi.spyOn(persistenceService, 'saveMessage');

            // Act
            const result = await persistenceService.saveUserMessage(
                sessionId,
                content,
                undefined // missing userId
            );

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('No userId provided');
            expect(saveMessageSpy).not.toHaveBeenCalled();
        });

        it('should return early if persistence is disabled', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const content = 'Test message with disabled persistence';

            // Create service with disabled persistence
            const disabledService = new MessagePersistenceService({
                disabled: true
            });

            // Mock saveMessage to verify it's not called
            const saveMessageSpy = vi.spyOn(disabledService, 'saveMessage');

            // Act
            const result = await disabledService.saveUserMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(true);
            expect(result.message).toContain('disabled');
            expect(saveMessageSpy).not.toHaveBeenCalled();
        });

        it('should handle errors from saveMessage properly', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const content = 'Test message with save error';
            const errorMessage = 'Test database error';

            // Mock saveMessage to throw an error
            vi.spyOn(persistenceService, 'saveMessage').mockRejectedValueOnce(
                new Error(errorMessage)
            );

            // Act
            const result = await persistenceService.saveUserMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(errorMessage);

            // Verify error was logged
            expect(edgeLogger.error).toHaveBeenCalledWith(
                'Failed to save user message',
                expect.objectContaining({
                    error: errorMessage
                })
            );
        });
    });

    describe('saveAssistantMessage', () => {
        it('should successfully save an assistant message', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const content = 'This is a test assistant message';

            // Mock saveMessage method for successful save
            vi.spyOn(persistenceService, 'saveMessage').mockResolvedValueOnce({
                success: true,
                messageId: 'test-message-id'
            });

            // Act
            const result = await persistenceService.saveAssistantMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-message-id');

            // Verify saveMessage was called with correct parameters
            expect(persistenceService.saveMessage).toHaveBeenCalledWith({
                sessionId,
                userId,
                role: 'assistant',
                content,
                messageId: expect.any(String),
                tools: undefined
            });
        });

        it('should process tool data from both parameters and content', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const toolsUsed = {
                tools: ['Web search', 'Knowledge base']
            };

            // Content with embedded tool calls
            const content = {
                choices: [{
                    message: {
                        tool_calls: [
                            {
                                id: 'tool-1',
                                type: 'function',
                                function: { name: 'searchWeb' }
                            }
                        ]
                    }
                }]
            };

            // Mock saveMessage method
            vi.spyOn(persistenceService, 'saveMessage').mockResolvedValueOnce({
                success: true,
                messageId: 'test-message-id'
            });

            // Act
            const result = await persistenceService.saveAssistantMessage(
                sessionId,
                content,
                userId,
                toolsUsed
            );

            // Assert
            expect(result.success).toBe(true);

            // Verify saveMessage was called with merged tool data
            const mockedSaveMessage = persistenceService.saveMessage as unknown as ReturnType<typeof vi.fn>;
            const saveMessageArgs = mockedSaveMessage.mock.calls[0][0];
            const toolsParam = saveMessageArgs.tools;

            expect(toolsParam).toBeDefined();
            expect(toolsParam.tools).toEqual(toolsUsed.tools);
            expect(toolsParam.api_tool_calls).toHaveLength(1);
            expect(toolsParam.api_tool_calls[0].name).toBe('searchWeb');
        });

        it('should handle errors during tool data extraction', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';

            // Create a content object that will trigger an error during parsing
            // We'll use a getter that throws an error instead of a simple null value
            const content = {
                choices: [{
                    get message() {
                        throw new Error('Error accessing message property');
                    }
                }]
            };

            // Mock saveMessage method
            vi.spyOn(persistenceService, 'saveMessage').mockResolvedValueOnce({
                success: true,
                messageId: 'test-message-id'
            });

            // Act - should not throw despite the error in tool extraction
            const result = await persistenceService.saveAssistantMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(true);

            // Verify saveMessage was called with undefined tools (error prevented tool extraction)
            expect(persistenceService.saveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: undefined
                })
            );
        });

        it('should ignore tool data extraction for string content', async () => {
            // Arrange
            const sessionId = 'test-session-id';
            const userId = 'test-user-id';
            const content = 'This is a simple string message';

            // Mock saveMessage method
            vi.spyOn(persistenceService, 'saveMessage').mockResolvedValueOnce({
                success: true,
                messageId: 'test-message-id'
            });

            // Act
            const result = await persistenceService.saveAssistantMessage(
                sessionId,
                content,
                userId
            );

            // Assert
            expect(result.success).toBe(true);

            // Verify saveMessage was called with undefined tools
            expect(persistenceService.saveMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: undefined
                })
            );
        });
    });
}); 