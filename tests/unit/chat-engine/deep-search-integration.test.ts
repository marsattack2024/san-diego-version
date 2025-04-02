/**
 * Deep Search Integration Test
 * 
 * This test suite verifies that the Deep Search functionality works correctly
 * when integrated with the full chat engine and agent router pipeline. It simulates
 * the same flow used in the application to ensure proper flag passing and tool execution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks before importing modules that use them
setupLoggerMock();

// Mock Next.js functions
vi.mock('next/headers', () => ({
    cookies: vi.fn().mockReturnValue({
        getAll: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        set: vi.fn()
    })
}));

// Mock React cache function
vi.mock('react', async () => {
    return {
        cache: (fn: Function) => fn,
        // Include any other React exports you're using
        useId: vi.fn().mockReturnValue('mocked-id'),
        useEffect: vi.fn()
    };
});

// Mock createServerClient
vi.mock('@supabase/ssr', () => ({
    createServerClient: vi.fn().mockReturnValue({
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
            getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } })
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: 'test-profile-id', name: 'Test User' } })
                })
            }),
            insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-conversation-id' } }) })
            }),
            update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: {} }) })
            })
        })
    })
}));

// Mock the Perplexity service
vi.mock('@/lib/services/perplexity.service', () => ({
    perplexityService: {
        initialize: vi.fn().mockReturnValue({ isReady: true }),
        search: vi.fn().mockResolvedValue({
            content: 'This is a mock search result from Perplexity API.',
            model: 'sonar',
            timing: { total: 500 }
        })
    }
}));

// Mock the streaming API
vi.mock('ai', () => {
    // Create a response structure similar to what streamText would return
    const mockResponse = {
        text: 'Based on my search, I found that...',
        toolCalls: [],
        toDataStreamResponse: vi.fn().mockImplementation(() => new Response('{}')),
        consumeStream: vi.fn()
    };

    // Mock the streamText function
    const streamTextMock = vi.fn().mockResolvedValue(mockResponse);

    // Mock the tool function used in knowledge-base.tool.ts
    const toolMock = vi.fn().mockImplementation((config) => {
        return {
            type: 'function',
            name: config.name || 'mock_tool',
            description: config.description || 'Mock tool description',
            parameters: config.parameters || {},
            execute: config.execute || (() => Promise.resolve('Mock tool response'))
        };
    });

    return {
        streamText: streamTextMock,
        StringOutputParser: vi.fn().mockImplementation(() => ({
            toDataStreamResponse: vi.fn().mockReturnValue(new Response('{}'))
        })),
        tool: toolMock
    };
});

// Mock fetch calls
vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve('success')
    })
));

// Import modules after mocking
import { createChatEngine, ChatEngineFacade } from '@/lib/chat-engine/chat-engine.facade';
import { detectAgentType } from '@/lib/chat-engine/agent-router';
import { createToolSet } from '@/lib/tools/registry.tool';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { perplexityService } from '@/lib/services/perplexity.service';
import { streamText } from 'ai';
import { AgentType } from '@/types/core/agent';

describe('Deep Search Integration Test', () => {
    beforeEach(() => {
        mockLogger.reset();
        vi.mocked(perplexityService.initialize).mockClear();
        vi.mocked(perplexityService.search).mockClear();
        vi.mocked(streamText).mockClear();

        // Default successful search response
        vi.mocked(perplexityService.search).mockResolvedValue({
            content: 'This is a mock search result from Perplexity API.',
            model: 'sonar',
            timing: { total: 500 }
        });

        // Set environment variables
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-supabase-url.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    /**
     * This test simulates the complete pipeline used in the app:
     * 1. Agent detection
     * 2. Tool set creation
     * 3. Chat engine initialization
     * 4. Request processing
     * 
     * This is how the app/api/chat/route.ts file processes requests
     */
    it('should correctly enable DeepSearch when flag is true', async () => {
        // 1. Simulate the app pipeline for agent detection
        const userQuery = "What are the latest developments in AI in 2023?";
        const { agentType, config: agentConfig } = await detectAgentType(userQuery, 'default');

        // 2. Set up DeepSearch flag as it happens in the route handler
        const deepSearchEnabled = true;

        // 3. Check if agent supports DeepSearch
        const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;
        const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

        // 4. Create tools with the proper DeepSearch setting
        const tools = createToolSet({
            useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
            useWebScraper: agentConfig.toolOptions.useWebScraper,
            useDeepSearch: shouldUseDeepSearch
        });

        // 5. Verify DeepSearch tool is included
        expect(tools).toHaveProperty('deepSearch');
        expect(Object.keys(tools)).toContain('deepSearch');

        // 6. Create chat engine with proper configuration
        const chatEngine = createChatEngine({
            tools,
            systemPrompt: 'You are an AI assistant that helps with information.',
            operationName: 'test_deepSearch',
            useDeepSearch: shouldUseDeepSearch,
            body: {
                deepSearchEnabled: shouldUseDeepSearch,
                sessionId: 'test-session-123',
                agentType
            },
            // Disable message persistence for testing
            messagePersistenceDisabled: true,
            requiresAuth: false
        });

        // 7. Create a test request
        const request = new Request('https://example.com/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: { role: 'user', content: userQuery, id: 'msg-123' },
                id: 'test-chat-123',
                deepSearchEnabled: true,
                agentId: agentType
            })
        });

        // 8. Process the request
        await chatEngine.handleRequest(request);

        // 9. Verify logging indicates DeepSearch was enabled
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Chat engine facade initialized',
            expect.objectContaining({
                useDeepSearch: true
            })
        );

        // 10. Verify creating tool set with DeepSearch
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Creating custom tool set',
            expect.objectContaining({
                useDeepSearch: true
            })
        );
    });

    /**
     * This test simulates the request handler when DeepSearch is disabled
     */
    it('should not include DeepSearch when flag is false', async () => {
        // 1. Simulate the app pipeline for agent detection
        const userQuery = "What are the latest developments in AI in 2023?";
        const { agentType, config: agentConfig } = await detectAgentType(userQuery, 'default');

        // 2. Set DeepSearch flag to false
        const deepSearchEnabled = false;

        // 3. Check if agent supports DeepSearch
        const canAgentUseDeepSearch = agentConfig.toolOptions.useKnowledgeBase;
        const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

        // 4. Create tools with the proper DeepSearch setting
        const tools = createToolSet({
            useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
            useWebScraper: agentConfig.toolOptions.useWebScraper,
            useDeepSearch: shouldUseDeepSearch
        });

        // 5. Verify DeepSearch tool is NOT included
        expect(tools).not.toHaveProperty('deepSearch');
        expect(Object.keys(tools)).not.toContain('deepSearch');

        // 6. Create chat engine with proper configuration
        const chatEngine = createChatEngine({
            tools,
            systemPrompt: 'You are an AI assistant that helps with information.',
            operationName: 'test_deepSearch',
            useDeepSearch: shouldUseDeepSearch,
            body: {
                deepSearchEnabled: shouldUseDeepSearch,
                sessionId: 'test-session-456',
                agentType
            },
            // Disable message persistence for testing
            messagePersistenceDisabled: true,
            requiresAuth: false
        });

        // 7. Create a test request
        const request = new Request('https://example.com/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: { role: 'user', content: userQuery, id: 'msg-456' },
                id: 'test-chat-456',
                deepSearchEnabled: false,
                agentId: agentType
            })
        });

        // 8. Process the request
        await chatEngine.handleRequest(request);

        // 9. Verify logging indicates DeepSearch was NOT enabled
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Chat engine facade initialized',
            expect.objectContaining({
                useDeepSearch: false
            })
        );

        // 10. Verify creating tool set WITHOUT DeepSearch
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Creating custom tool set',
            expect.objectContaining({
                useDeepSearch: false
            })
        );
    });

    it('should test deep search with various agents', async () => {
        // Test with different agent types - use correct types from the AgentType definition
        const agentTypes: Array<AgentType> = ['default', 'copywriting', 'google-ads', 'facebook-ads'];
        const userQuery = "What are the latest trends in portrait photography in 2023?";

        for (const requestedAgentType of agentTypes) {
            // Reset mocks for each agent
            mockLogger.reset();
            vi.mocked(streamText).mockClear();

            // 1. Detect agent type
            const { agentType, config: agentConfig } = await detectAgentType(userQuery, requestedAgentType);

            // 2. Deep Search is explicitly enabled
            const deepSearchEnabled = true;

            // 3. Check if this agent supports DeepSearch
            const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;
            const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

            // 4. Create tool set
            const tools = createToolSet({
                useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
                useWebScraper: agentConfig.toolOptions.useWebScraper,
                useDeepSearch: shouldUseDeepSearch
            });

            // 5. Create chat engine
            const chatEngine = createChatEngine({
                tools,
                systemPrompt: 'You are an AI assistant that helps with information.',
                operationName: `test_${agentType}`,
                useDeepSearch: shouldUseDeepSearch,
                body: {
                    deepSearchEnabled: shouldUseDeepSearch,
                    sessionId: `test-session-${agentType}`,
                    agentType
                },
                // Disable message persistence for testing
                messagePersistenceDisabled: true,
                requiresAuth: false
            });

            // 6. Prepare request
            const request = new Request('https://example.com/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: { role: 'user', content: userQuery, id: `msg-${agentType}` },
                    id: `test-chat-${agentType}`,
                    deepSearchEnabled: true,
                    agentId: agentType
                })
            });

            // 7. Process request
            await chatEngine.handleRequest(request);

            // 8. Verify logging indicates proper DeepSearch configuration
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Chat engine facade initialized',
                expect.objectContaining({
                    useDeepSearch: shouldUseDeepSearch
                })
            );

            // 9. Check if the agent supports DeepSearch as expected
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Creating custom tool set',
                expect.objectContaining({
                    useDeepSearch: shouldUseDeepSearch,
                })
            );

            // 10. Log agent-specific DeepSearch support
            console.log(`Agent ${agentType}: DeepSearch supported = ${canAgentUseDeepSearch}, DeepSearch enabled = ${shouldUseDeepSearch}`);
        }
    });

    it('should verify correct flag passing to the tool execution context', async () => {
        // Create a manual request with DeepSearch enabled
        const userMessage = "Can you search for the latest AI research papers?";
        const sessionId = 'test-session-flag-passing';

        // 1. Detect agent
        const { agentType, config: agentConfig } = await detectAgentType(userMessage, 'default');

        // 2. Enable Deep Search
        const deepSearchEnabled = true;

        // 3. Create tool set with Deep Search enabled
        const tools = createToolSet({
            useKnowledgeBase: true,
            useWebScraper: true,
            useDeepSearch: true
        });

        // 4. Create chat engine with explicit DeepSearch enabling
        const chatEngine = createChatEngine({
            tools,
            systemPrompt: 'You are an AI assistant with web search capabilities.',
            operationName: 'test_flag_passing',
            // Explicitly enable DeepSearch
            useDeepSearch: true,
            body: {
                deepSearchEnabled: true,
                sessionId,
                agentType
            },
            // Disable message persistence for testing
            messagePersistenceDisabled: true,
            requiresAuth: false
        });

        // 5. Create request with explicit DeepSearch flag
        const request = new Request('https://example.com/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: { role: 'user', content: userMessage, id: 'msg-flag-test' },
                id: sessionId,
                // Explicitly enable DeepSearch in the request
                deepSearchEnabled: true,
                agentId: agentType
            })
        });

        // 6. Process request
        await chatEngine.handleRequest(request);

        // 7. Verify flag was passed in correct logs
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Chat engine facade initialized',
            expect.objectContaining({
                useDeepSearch: true,
                operation: 'test_flag_passing'
            })
        );

        // 8. Verify the tool option was included in the tools configuration
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Creating custom tool set',
            expect.objectContaining({
                category: LOG_CATEGORIES.TOOLS,
                operation: 'create_tool_set',
                useDeepSearch: true
            })
        );
    });
}); 