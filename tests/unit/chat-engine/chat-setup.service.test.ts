// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import type { AgentType } from '@/types/core/agent'; // Keep this if needed for AgentConfig type checks
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
import { z } from 'zod';
import type { Tool } from 'ai';

// 2. Mocks (BEFORE importing module under test)
setupLoggerMock();

// Mock dependencies used ONLY by the WIDGET path in prepareConfig
vi.mock('@/lib/chat-engine/agent-router', () => ({
    // Only need getAgentConfig for widget path (gets base 'default')
    getAgentConfig: vi.fn(),
    // Add detectAgentType mock so spyOn has a target
    detectAgentType: vi.fn()
}));

vi.mock('@/lib/tools/registry.tool', () => ({
    // Only need widgetTools for widget path
    widgetTools: { getInformation: { /* mock tool */ } },
    // Add createToolSet mock so spyOn has a target
    createToolSet: vi.fn()
}));

vi.mock('@/lib/chat-engine/prompts', () => ({
    // Only need prompts.widget for widget path
    prompts: {
        widget: 'Mock Widget System Prompt'
    },
    // Re-add AVAILABLE_AGENT_TYPES as it seems needed by orchestrator implicitly
    AVAILABLE_AGENT_TYPES: ['default', 'copywriting', 'google-ads', 'facebook-ads', 'quiz']
}));

// 3. Import module under test
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
// Import mocks AFTER vi.mock calls
import { getAgentConfig } from '@/lib/chat-engine/agent-router';
import { widgetTools } from '@/lib/tools/registry.tool';
import { prompts } from '@/lib/chat-engine/prompts';

// Import the actual modules we want to spy on
import * as agentRouter from '@/lib/chat-engine/agent-router';
import * as toolRegistry from '@/lib/tools/registry.tool';

// 4. Test Suite
describe('ChatSetupService (Widget Only)', () => {
    let chatSetupService: ChatSetupService;

    // Default mock implementation for dependencies used by widget path
    const defaultAgentConfigBase = {
        systemPrompt: 'Default Base Prompt', // This won't be used, widget prompt overrides
        temperature: 0.5,
        model: 'gpt-4o',
        toolOptions: { useKnowledgeBase: true, useWebScraper: true, useDeepSearch: true, useRagTool: true, useProfileContext: true }
    };

    beforeEach(() => {
        // Reset mocks for isolation
        vi.resetAllMocks();
        mockLogger.reset();

        // Provide default implementations for mocks using vi.mocked
        vi.mocked(getAgentConfig).mockReturnValue(defaultAgentConfigBase);

        // Initialize service instance
        chatSetupService = new ChatSetupService();

        vi.restoreAllMocks(); // Use restoreAllMocks to reset spies too
    });

    // --- REMOVED Main Chat Tests --- 
    // These tests are invalid as prepareConfig only handles widgets.
    // Main chat setup logic is likely in AgentOrchestrator and needs separate tests.

    // --- Widget Chat Tests (isWidget: true) --- 
    describe('Widget Chat Context (isWidget: true)', () => {

        const widgetInput = {
            requestBody: { sessionId: 'widget-session-123', message: 'Hi widget' },
            userId: undefined, // Widget has no user ID
            isWidget: true
        };

        // Test that prepareConfig throws error if called with isWidget: false
        it('should throw error if called for non-widget context', async () => {
            const nonWidgetInput = { ...widgetInput, isWidget: false };
            await expect(chatSetupService.prepareConfig(nonWidgetInput))
                .rejects
                .toThrow('ChatSetupService.prepareConfig should only be used for widget setups.');
        });

        it('should NOT call detectAgentType or createToolSet for widgets', async () => {
            // Spy on the actual functions we don't expect to be called
            const detectAgentSpy = vi.spyOn(agentRouter, 'detectAgentType');
            const createToolSetSpy = vi.spyOn(toolRegistry, 'createToolSet');

            await chatSetupService.prepareConfig(widgetInput);

            // Assert that the spies were NOT called
            expect(detectAgentSpy).not.toHaveBeenCalled();
            expect(createToolSetSpy).not.toHaveBeenCalled();
            // Verify getAgentConfig WAS called
            expect(getAgentConfig).toHaveBeenCalledWith('default');
        });

        it('should use fixed widgetTools', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);
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
            expect(config.cacheEnabled).toBe(true);
            expect(config.operationName).toContain('widget_chat_');
        });

        it('should use specific widget system prompt', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);
            // Assert it uses the specific prompt from the mock
            expect(config.systemPrompt).toBe(prompts.widget);
        });

        it('should populate config.body correctly for widget', async () => {
            const config = await chatSetupService.prepareConfig(widgetInput);

            // prepareConfig only returns ChatEngineConfig, no need for type guard
            expect(config.body).toBeDefined();
            expect(config.body?.deepSearchEnabled).toBe(false);
            expect(config.body?.sessionId).toBe('widget-session-123');
            expect(config.body?.userId).toBeUndefined();
            expect(config.body?.agentType).toBe('default'); // Underlying type
            expect(config.body?.isWidgetChat).toBe(true);
            expect(config.body?.bypassAuth).toBe(true);
        });
    });
}); 