/// <reference types="vitest/globals" />

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from './orchestrator.service';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { detectAgentType, getAgentConfig } from '@/lib/chat-engine/agent-router';
import { AgentType } from '@/lib/chat-engine/prompts';
import type { OrchestratorResult } from '@/lib/chat-engine/types/orchestrator';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// --- Mock Dependencies --- 
setupLoggerMock();

vi.mock('@ai-sdk/openai', () => ({
    openai: vi.fn().mockReturnValue({ modelId: 'mock-openai-model' })
}));

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal() as object),
    generateObject: vi.fn()
}));

vi.mock('@/lib/chat-engine/agent-router', () => ({
    detectAgentType: vi.fn(),
    getAgentConfig: vi.fn()
}));

// --- Test Suite --- 
describe('AgentOrchestrator', () => {
    let orchestrator: AgentOrchestrator;

    // Define a reusable default mock config - remove type if import fails
    const defaultMockAgentConfig = {
        systemPrompt: 'Default mock prompt',
        temperature: 0.5,
        model: 'default-mock-model',
        maxTokens: 1000,
        toolOptions: {
            useKnowledgeBase: false,
            useWebScraper: false,
            useDeepSearch: false,
            useRagTool: false,
            useProfileContext: false
        }
    } as any; // Cast to any if AgentConfig type cannot be found

    beforeEach(() => {
        // Reset mocks using vi.mocked
        vi.mocked(detectAgentType).mockReset();
        vi.mocked(getAgentConfig).mockReset();
        vi.mocked(generateObject).mockReset();
        mockLogger.reset();

        // --- Default Mock Implementations ---
        vi.mocked(detectAgentType).mockResolvedValue({
            agentType: 'default',
            config: defaultMockAgentConfig,
            reasoning: 'Default detection'
        } as any);

        vi.mocked(getAgentConfig).mockReturnValue(defaultMockAgentConfig);

        vi.mocked(generateObject).mockResolvedValue({
            object: { /* Default mock plan/output */ },
            finishReason: 'stop',
            usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
            warnings: undefined,
            rawResponse: { headers: {} },
            response: { id: 'mock-res-id', timestamp: new Date(), modelId: 'mock-model' },
            request: {},
            providerMetadata: {},
            logprobs: undefined,
            experimental_customData: undefined
        } as any); // Cast outer result to any if needed

        // Initialize orchestrator for isolation
        orchestrator = new AgentOrchestrator();
    });

    // --- Tests --- 
    describe('prepareContext', () => {
        it('should detect agent and return context', async () => {
            const input: { userQuery: string; agentId?: AgentType } = { userQuery: 'Hello world', agentId: undefined };
            const result = await orchestrator.prepareContext(input.userQuery, input.agentId);

            expect(detectAgentType).toHaveBeenCalledWith('Hello world', undefined);
            expect(result).toEqual(expect.objectContaining({
                targetModelId: defaultMockAgentConfig.model,
                contextMessages: []
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Agent detection complete',
                expect.objectContaining({ detectedAgent: 'default' })
            );
        });

        it('should use provided agentId and skip detection', async () => {
            const input: { userQuery: string; agentId?: AgentType } = { userQuery: 'Analyze this image', agentId: 'copywriting' };
            // Override getAgentConfig for this specific agent - cast to any
            const copywritingConfig = { ...defaultMockAgentConfig, model: 'copywriting-model' } as any;
            vi.mocked(getAgentConfig).mockReturnValue(copywritingConfig);

            const result = await orchestrator.prepareContext(input.userQuery, input.agentId);

            expect(detectAgentType).not.toHaveBeenCalled();
            expect(getAgentConfig).toHaveBeenCalledWith('copywriting');
            expect(result).toEqual(expect.objectContaining({
                targetModelId: 'copywriting-model',
                contextMessages: []
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Using specified agent',
                expect.objectContaining({ specifiedAgent: 'copywriting' })
            );
        });

        // Add more tests for prepareContext: 
        // - Error handling if detectAgentType fails
        // - Cases where context messages might be generated (if applicable)
    });

    // Add tests for other orchestrator methods if they exist...

});