// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import type { AgentType } from '@/types/core/agent';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
import { z } from 'zod';
import type { Tool } from 'ai';

// 2. Mocks (BEFORE importing module under test)
setupLoggerMock();

// Mock dependencies using factory functions to avoid hoisting issues
vi.mock('@/lib/chat-engine/agent-router', () => ({
    detectAgentType: vi.fn(), // Define mocks inside factory
    getAgentConfig: vi.fn(),
}));

vi.mock('@/lib/tools/registry.tool', () => ({
    createToolSet: vi.fn(),
    widgetTools: { getInformation: { /* mock tool */ } }
}));

vi.mock('@/lib/chat-engine/prompts', () => ({
    prompts: {
        buildSystemPrompt: vi.fn() // Define mock inside factory
    },
    AgentType: { Default: 'default', Copywriting: 'copywriting', /* ... other agent types ... */ } // Keep type export if needed
}));

// Mock misc utils if needed, parseBooleanValue is simple enough maybe not needed
// vi.mock('@/lib/utils/misc-utils', () => ({
//   parseBooleanValue: vi.fn((val) => !!val) // Simple mock if needed
// }));

// 3. Import module under test
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
// Import mocks AFTER vi.mock calls
import { detectAgentType, getAgentConfig } from '@/lib/chat-engine/agent-router';
import { createToolSet, widgetTools } from '@/lib/tools/registry.tool';
import { prompts } from '@/lib/chat-engine/prompts';

// 4. Test Suite
describe('ChatSetupService', () => {
    let chatSetupService: ChatSetupService;

    // Default mock implementations
    const defaultAgentConfig = {
        systemPrompt: 'Default Prompt',
        temperature: 0.5,
        model: 'gpt-4o',
        toolOptions: { useKnowledgeBase: true, useWebScraper: true, useDeepSearch: true, useRagTool: true, useProfileContext: true }
    };
    const copywritingAgentConfig = {
        systemPrompt: 'Copywriting Prompt',
        temperature: 0.7,
        model: 'gpt-4o',
        toolOptions: { useKnowledgeBase: true, useWebScraper: true, useDeepSearch: true, useRagTool: true, useProfileContext: true }
    };

    // Create a minimal mock tool structure
    const mockTool: Tool<any, any> = {
        description: "Mock tool description",
        parameters: z.object({}), // Assuming Zod is imported or use simple object
        execute: async () => ({ result: "mock execution" })
    };

    beforeEach(() => {
        // Reset mocks for isolation
        vi.resetAllMocks();
        mockLogger.reset();

        // Provide default implementations for mocks using vi.mocked
        vi.mocked(detectAgentType).mockResolvedValue({ agentType: 'default', config: defaultAgentConfig, reasoning: 'Default detection' });
        vi.mocked(getAgentConfig).mockImplementation((agentType: AgentType) => {
            if (agentType === 'copywriting') return copywritingAgentConfig;
            return defaultAgentConfig;
        });
        vi.mocked(createToolSet).mockReturnValue({ tool1: mockTool, tool2: mockTool });
        vi.mocked(prompts.buildSystemPrompt).mockReturnValue('Generated System Prompt');

        // Initialize service instance
        chatSetupService = new ChatSetupService();
    });

    // --- Main Chat Tests (isWidget: false) --- 
    describe('Main Chat Context (isWidget: false)', () => {

        const baseInput = {
            requestBody: { id: 'session-123', message: { role: 'user', content: 'Hello' } },
            userId: 'user-abc',
            isWidget: false
        };

        it('should call detectAgentType and createToolSet with default settings', async () => {
            const config = await chatSetupService.prepareConfig(baseInput);

            // Add type guard before accessing ChatEngineConfig properties
            if ('type' in config && config.type === 'orchestrated') {
                // This shouldn't happen in this test case, fail if it does
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                // Now TS knows config is ChatEngineConfig here
                expect(detectAgentType).toHaveBeenCalledWith('Hello', 'default');
                expect(createToolSet).toHaveBeenCalledWith({
                    useKnowledgeBase: true,
                    useWebScraper: true,
                    useDeepSearch: false,
                    useProfileContext: true
                });
                expect(prompts.buildSystemPrompt).toHaveBeenCalledWith('default', false);
                expect(config.agentType).toBe('default');
                expect(config.requiresAuth).toBe(true);
                expect(config.messagePersistenceDisabled).toBe(false);
                expect(config.useDeepSearch).toBe(false);
                expect(config.body?.deepSearchEnabled).toBe(false);
                expect(config.body?.userId).toBe('user-abc');
                expect(config.body?.isWidgetChat).toBe(false);
                expect(config.tools).toEqual({ tool1: mockTool, tool2: mockTool });
            }
        });

        it('should enable DeepSearch AND pass useProfileContext when flag is true and agent supports it', async () => {
            // Mock agent detection to return an agent that supports deep search AND profile context
            const agentConfigWithTools = {
                ...defaultAgentConfig,
                toolOptions: {
                    ...defaultAgentConfig.toolOptions,
                    useDeepSearch: true,
                    useProfileContext: true
                }
            };
            vi.mocked(detectAgentType).mockResolvedValue({ agentType: 'default', config: agentConfigWithTools, reasoning: 'Default detection' });
            vi.mocked(getAgentConfig).mockReturnValue(agentConfigWithTools); // Ensure getAgentConfig returns the same

            const input = { ...baseInput, requestBody: { ...baseInput.requestBody, deepSearchEnabled: true } };
            const config = await chatSetupService.prepareConfig(input);

            if ('type' in config && config.type === 'orchestrated') {
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                expect(detectAgentType).toHaveBeenCalled();
                expect(createToolSet).toHaveBeenCalledWith({
                    useKnowledgeBase: true,
                    useWebScraper: true,
                    useDeepSearch: true, // Should be true now
                    useProfileContext: true // Should still be true
                });
                expect(prompts.buildSystemPrompt).toHaveBeenCalledWith('default', true);
                expect(config.useDeepSearch).toBe(true);
                expect(config.body?.deepSearchEnabled).toBe(true);
            }
        });

        it('should NOT enable DeepSearch when flag is true but agent does NOT support it', async () => {
            // Mock agent detection to return an agent that does NOT support deep search
            const noDeepSearchAgentConfig = { ...defaultAgentConfig, toolOptions: { ...defaultAgentConfig.toolOptions, useDeepSearch: false } };
            vi.mocked(detectAgentType).mockResolvedValue({ agentType: 'default', config: noDeepSearchAgentConfig, reasoning: 'Default detection' });
            vi.mocked(getAgentConfig).mockReturnValue(noDeepSearchAgentConfig);

            const input = { ...baseInput, requestBody: { ...baseInput.requestBody, deepSearchEnabled: true } };
            const config = await chatSetupService.prepareConfig(input);

            if ('type' in config && config.type === 'orchestrated') {
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                expect(detectAgentType).toHaveBeenCalled();
                expect(createToolSet).toHaveBeenCalledWith({
                    useKnowledgeBase: true,
                    useWebScraper: true,
                    useDeepSearch: false // Should remain false
                });
                expect(prompts.buildSystemPrompt).toHaveBeenCalledWith('default', false);
                expect(config.useDeepSearch).toBe(false);
                expect(config.body?.deepSearchEnabled).toBe(false);
            }
        });

        it('should use requestedAgentId for detection and config, including profile context flag', async () => {
            // Ensure the mock copywriting config includes the profile flag
            const updatedCopywritingAgentConfig = {
                ...copywritingAgentConfig,
                toolOptions: { ...copywritingAgentConfig.toolOptions, useProfileContext: true }
            };
            vi.mocked(detectAgentType).mockResolvedValue({ agentType: 'copywriting', config: updatedCopywritingAgentConfig, reasoning: 'User request' });
            vi.mocked(getAgentConfig).mockReturnValue(updatedCopywritingAgentConfig);

            const input = { ...baseInput, requestBody: { ...baseInput.requestBody, agentId: 'copywriting' } };
            const config = await chatSetupService.prepareConfig(input);

            if ('type' in config && config.type === 'orchestrated') {
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                expect(detectAgentType).toHaveBeenCalledWith('Hello', 'copywriting');
                expect(createToolSet).toHaveBeenCalledWith({
                    useKnowledgeBase: updatedCopywritingAgentConfig.toolOptions.useKnowledgeBase,
                    useWebScraper: updatedCopywritingAgentConfig.toolOptions.useWebScraper,
                    useDeepSearch: false, // Input flag overrides agent capability here
                    useProfileContext: true // Should be true for copywriting agent
                });
                expect(prompts.buildSystemPrompt).toHaveBeenCalledWith('copywriting', false);
                expect(config.agentType).toBe('copywriting');
                expect(config.temperature).toBe(copywritingAgentConfig.temperature);
                expect(config.body?.agentType).toBe('copywriting');
            }
        });

        it('should handle agent detection failure gracefully, falling back to default profile context setting', async () => {
            const error = new Error('LLM routing failed');
            vi.mocked(detectAgentType).mockRejectedValue(error);
            // Ensure getAgentConfig returns default when called with 'default'
            vi.mocked(getAgentConfig).mockReturnValue(defaultAgentConfig);

            const config = await chatSetupService.prepareConfig(baseInput);

            if ('type' in config && config.type === 'orchestrated') {
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                expect(detectAgentType).toHaveBeenCalledWith('Hello', 'default');
                expect(createToolSet).toHaveBeenCalledWith({
                    useKnowledgeBase: defaultAgentConfig.toolOptions.useKnowledgeBase,
                    useWebScraper: defaultAgentConfig.toolOptions.useWebScraper,
                    useDeepSearch: false,
                    useProfileContext: defaultAgentConfig.toolOptions.useProfileContext // Should use default's setting
                });
                expect(prompts.buildSystemPrompt).toHaveBeenCalledWith('default', false);
                expect(config.agentType).toBe('default');
                expect(config.useDeepSearch).toBe(false);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Agent detection failed'),
                    expect.objectContaining({ error: error.message })
                );
            }
        });

        it('should populate config.body correctly', async () => {
            const input = { ...baseInput, requestBody: { ...baseInput.requestBody, deepSearchEnabled: true, id: 'session-xyz' } };
            const config = await chatSetupService.prepareConfig(input);

            if ('type' in config && config.type === 'orchestrated') {
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                expect(config.body).toBeDefined();
                expect(config.body?.deepSearchEnabled).toBe(config.useDeepSearch);
                expect(config.body?.sessionId).toBe('session-xyz');
                expect(config.body?.userId).toBe('user-abc');
                expect(config.body?.agentType).toBe('default');
                expect(config.body?.isWidgetChat).toBe(false);
                expect(config.body?.bypassAuth).toBe(false); // Default for main chat
            }
        });

    });

    // --- Widget Chat Tests (isWidget: true) --- 
    describe('Widget Chat Context (isWidget: true)', () => {

        const widgetInput = {
            requestBody: { sessionId: 'widget-session-123', message: 'Hi widget' },
            userId: undefined, // Widget has no user ID
            isWidget: true
        };

        it('should NOT call detectAgentType for widgets', async () => {
            await chatSetupService.prepareConfig(widgetInput);
            expect(detectAgentType).not.toHaveBeenCalled();
        });

        it('should use fixed widgetTools', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);
            expect(createToolSet).not.toHaveBeenCalled(); // Should not dynamically create
            expect(config.tools).toBe(widgetTools); // Should use the imported fixed tools
        });

        it('should apply widget-specific config overrides', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);
            expect(config.model).toBe('gpt-4o-mini');
            expect(config.temperature).toBe(0.4);
            expect(config.requiresAuth).toBe(false);
            expect(config.messagePersistenceDisabled).toBe(true);
            expect(config.corsEnabled).toBe(true);
            expect(config.useDeepSearch).toBe(false);
            expect(config.useWebScraper).toBe(false);
            expect(config.messageHistoryLimit).toBe(20);
            expect(config.maxTokens).toBe(800);
        });

        it('should build widget system prompt and disable deep search', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);
            // We kept agentType='default' but apply overrides, so prompt might still use default base
            // Verify prompt was called correctly for the widget context (deep search false)
            expect(prompts.buildSystemPrompt).toHaveBeenCalledWith('default', false);
            expect(config.systemPrompt).toBe('Generated System Prompt'); // From mock
            expect(config.useDeepSearch).toBe(false);
        });

        it('should populate config.body correctly for widget', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);

            if ('type' in config && config.type === 'orchestrated') {
                expect.fail('Expected ChatEngineConfig but received OrchestratedResponse');
            } else {
                expect(config.body).toBeDefined();
                expect(config.body?.deepSearchEnabled).toBe(false);
                expect(config.body?.sessionId).toBe('widget-session-123');
                expect(config.body?.userId).toBeUndefined();
                expect(config.body?.agentType).toBe('default'); // Underlying type
                expect(config.body?.isWidgetChat).toBe(true);
                expect(config.body?.bypassAuth).toBe(true);
            }
        });
    });
}); 