// /// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from './orchestrator.service';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { getAgentConfig } from '../agent-router';
import {
    WorkflowPlanSchema,
    AgentOutputSchema,
    OrchestratorResultSchema,
    WorkflowPlan,
    AgentOutput
} from '../types/orchestrator';
import { AgentType } from '../prompts';

// Mock dependencies
vi.mock('@ai-sdk/openai', () => ({
    openai: vi.fn().mockReturnValue({ /* Mock LanguageModel object if needed */ modelId: 'mock-gpt-4o-mini' })
}));

vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('ai');
    return {
        ...actual,
        generateObject: vi.fn(), // Mock generateObject
    };
});

vi.mock('../agent-router', () => ({
    getAgentConfig: vi.fn()
}));

// Mock logger to prevent actual logging during tests
vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

describe('AgentOrchestrator', () => {
    let orchestrator: AgentOrchestrator;
    const mockGenerateObject = generateObject as vi.Mock;
    const mockGetAgentConfig = getAgentConfig as vi.Mock;

    beforeEach(() => {
        vi.clearAllMocks(); // Reset mocks before each test
        orchestrator = new AgentOrchestrator();

        // Default mock for getAgentConfig
        mockGetAgentConfig.mockImplementation((agentType: AgentType) => ({
            systemPrompt: `Mock system prompt for ${agentType}`,
            temperature: 0.5,
            model: 'mock-gpt-4o',
            maxTokens: 1000,
            toolOptions: {}
        }));
    });

    describe('generatePlan', () => {
        it('should generate a valid workflow plan', async () => {
            // Arrange
            const request = 'Test request';
            const mockPlan: WorkflowPlan = {
                steps: [
                    { agent: 'default', task: 'Step 1 task' },
                    { agent: 'copywriting', task: 'Step 2 task', dependsOn: [0] },
                ],
                maxIterations: 5,
            };
            mockGenerateObject.mockResolvedValue({ object: mockPlan, usage: {}, finishReason: 'stop', warnings: [] });

            // Act
            const plan = await orchestrator.generatePlan(request);

            // Assert
            expect(mockGenerateObject).toHaveBeenCalledOnce();
            expect(plan).toEqual(mockPlan);
            // Add more specific assertions about the prompt if needed
        });

        it('should throw an error if plan generation fails', async () => {
            // Arrange
            const request = 'Test request';
            const error = new Error('LLM Error');
            mockGenerateObject.mockRejectedValue(error);

            // Act & Assert
            await expect(orchestrator.generatePlan(request)).rejects.toThrow('Failed to generate workflow plan: LLM Error');
        });

        it('should throw an error if the generated plan has no steps', async () => {
            // Arrange
            const request = 'Test request';
            const mockPlan: WorkflowPlan = { steps: [], maxIterations: 5 };
            mockGenerateObject.mockResolvedValue({ object: mockPlan, usage: {}, finishReason: 'stop', warnings: [] });

            // Act & Assert
            await expect(orchestrator.generatePlan(request)).rejects.toThrow('Generated workflow plan is empty.');
        });
    });

    describe('executePlan', () => {
        // TODO: Add tests for executePlan
        // - Basic execution (no deps)
        // - Execution with dependencies
        // - Dependency not met scenario
        // - Re-planning triggered
        // - Re-planning fails
        // - Worker execution error
        // - Max iterations reached
        // - No progress / deadlock
        it.todo('should execute a simple plan without dependencies');
        it.todo('should execute steps respecting dependencies');
        it.todo('should trigger re-planning when a step needs revision');
        it.todo('should handle worker execution errors');
        it.todo('should stop execution if max iterations are reached');
        it.todo('should stop execution if no progress is made');
    });

    describe('compileResults', () => {
        // TODO: Add tests for compileResults
        it.todo('should compile results from context correctly');
        it.todo('should indicate non-completed steps');
    });

    describe('run', () => {
        // TODO: Add tests for the main run method
        // - Successful run
        // - Error during planning
        // - Error during execution
        it.todo('should orchestrate plan, execution, and compilation');
        it.todo('should handle errors during plan generation');
        it.todo('should handle errors during plan execution');
    });
});