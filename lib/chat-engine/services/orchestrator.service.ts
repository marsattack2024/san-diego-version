import { z } from 'zod';
import { openai } from '@ai-sdk/openai'; // Assuming OpenAI is configured
import { generateObject, LanguageModel } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { AgentType, AVAILABLE_AGENT_TYPES } from '../prompts';
import { getAgentConfig } from '../agent-router';
import {
    WorkflowPlanSchema,
    WorkflowPlan,
    WorkflowStep,
    AgentOutputSchema,
    AgentOutput,
    WorkflowContext,
    OrchestratorResultSchema,
    OrchestratorResult
} from '../types/orchestrator';
// Import AI SDK tool type if needed for passing tools
import type { Tool } from 'ai';
// Import tool creation function if tools are passed dynamically
// import { createToolSet } from '@/lib/tools/registry.tool';

export class AgentOrchestrator {
    private logger = edgeLogger;
    private orchestratorModel: LanguageModel;

    constructor() {
        this.orchestratorModel = openai('gpt-4o-mini');
        this.logger.info('AgentOrchestrator initialized', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            model: this.orchestratorModel.modelId,
        });
    }

    /**
     * Generates the workflow plan, assessing complexity and choosing single vs. multi-step.
     */
    async generatePlan(request: string, initialAgentType?: AgentType): Promise<WorkflowPlan> {
        const operationId = `plan_${Date.now().toString(36)}`;
        const startTime = Date.now();
        const availableSpecializedAgents = AVAILABLE_AGENT_TYPES.filter(a => a !== 'default').join(', ');

        this.logger.info('Generating workflow plan (incl. complexity assessment)', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'generate_plan',
            operationId,
            requestPreview: request.substring(0, 100) + '...',
            initialAgentHint: initialAgentType,
        });

        try {
            const systemPrompt = `You are a highly intelligent workflow manager. Your tasks are:
1. Analyze the user request and any user agent hint provided.
2. Determine if the request is SIMPLE (can be answered directly by the 'default' agent, possibly using RAG/tools) or COMPLEX (requires multiple steps like research, specific generation like quiz/ads, and copyediting).
3. Generate a workflow plan object based on your determination:
    - If SIMPLE: Create a plan with ONLY ONE step using the 'default' agent (or the most appropriate single agent based on the request hint) with the task: "Answer the user query directly using available tools like RAG."
    - If COMPLEX: Create a detailed multi-step plan (typically 2-3 steps, max 5) using the most appropriate specialized agents. Common flows involve a 'researcher' first, then a primary generation agent (e.g., 'quiz', 'google-ads', 'copywriting'), followed by a 'copyeditor' for refinement. Define clear tasks and dependencies. Ensure the final step produces the user-facing output.
Available specialized agents: ${availableSpecializedAgents}.`;

            const prompt = `User Request: "${request}"
User Agent Hint: ${initialAgentType || 'default'}

Analyze this request and generate the appropriate workflow plan (either single-step simple or multi-step complex) based on your system instructions. Ensure the plan achieves the user's goal.`;

            const { object: plan, usage, finishReason, warnings } = await generateObject({
                model: this.orchestratorModel,
                schema: WorkflowPlanSchema,
                system: systemPrompt,
                prompt: prompt,
                maxRetries: 2,
            });

            const durationMs = Date.now() - startTime;
            this.logger.info('Workflow plan generated successfully', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'generate_plan_success',
                operationId,
                durationMs,
                stepCount: plan.steps.length,
                planPreview: JSON.stringify(plan.steps.map(s => s.agent)),
                usage,
                finishReason,
                warnings,
            });

            // Validate plan structure
            if (!plan.steps || plan.steps.length === 0) {
                throw new Error('Generated workflow plan is empty.');
            }
            if (plan.steps.some(step => !AVAILABLE_AGENT_TYPES.includes(step.agent))) {
                const invalidAgent = plan.steps.find(step => !AVAILABLE_AGENT_TYPES.includes(step.agent))?.agent;
                throw new Error(`Generated plan uses invalid agent type: ${invalidAgent}`);
            }


            return plan;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error('Error generating workflow plan', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'generate_plan_error',
                operationId,
                durationMs,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true,
            });
            throw new Error(`Failed to generate workflow plan: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Executes the workflow plan step-by-step.
     */
    async executePlan(plan: WorkflowPlan, initialRequest: string): Promise<{ context: WorkflowContext, finalPlan: WorkflowPlan }> {
        const operationId = `exec_${Date.now().toString(36)}`;
        const execStartTime = Date.now();
        this.logger.info('Executing workflow plan', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'execute_plan_start',
            operationId,
            stepCount: plan.steps.length
        });

        let context: WorkflowContext = {};
        let iteration = 0;
        let currentPlan = { ...plan, steps: [...plan.steps] }; // Deep copy steps for modification

        while (iteration < currentPlan.maxIterations) {
            const iterStartTime = Date.now();
            this.logger.info(`Starting execution iteration ${iteration + 1}/${currentPlan.maxIterations}`, {
                category: LOG_CATEGORIES.ORCHESTRATOR, operationId, iteration: iteration + 1
                // ... other relevant iter log data
            });

            let madeProgress = false;
            let allStepsComplete = true;
            let planChangedThisIteration = false;

            for (let i = 0; i < currentPlan.steps.length; i++) {
                if (planChangedThisIteration) break;

                const step = currentPlan.steps[i];
                const stepLogId = `${operationId}_step_${i}`;

                if (context[i]) { continue; }

                allStepsComplete = false;

                const dependenciesMet = !step.dependsOn || step.dependsOn.every(depIndex => context[depIndex]);
                if (!dependenciesMet) {
                    this.logger.debug(`Step ${i} (${step.agent}) dependencies not met`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, step: i });
                    continue;
                }

                this.logger.info(`Executing Step ${i}: Agent=${step.agent}`, {
                    category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_step_start',
                    operationId, step: i, agent: step.agent, stepLogId
                });
                const stepStartTime = Date.now();

                try {
                    // Cast needed as workaround for persistent TS error
                    const agentConfig = getAgentConfig(step.agent as AgentType);
                    if (!agentConfig) throw new Error(`Agent configuration not found for type: ${step.agent}`);

                    // Prepare context string (simple version)
                    // TODO: Improve context passing
                    let workerContextInput = `Initial Request: "${initialRequest}"\n`;
                    if (step.dependsOn && step.dependsOn.length > 0) {
                        workerContextInput += "\nRelevant previous step results:\n";
                        step.dependsOn.forEach(depIndex => {
                            if (context[depIndex]) {
                                workerContextInput += `--- Output from Step ${depIndex} (${currentPlan.steps[depIndex]?.agent}) ---\n${context[depIndex].result}\n\n`;
                            }
                        });
                    }
                    const workerPrompt = `${workerContextInput}\nYour Task: ${step.task}`;

                    // Dynamically create tool set for the agent if needed
                    // let toolsForAgent: Record<string, Tool<any, any>> | undefined = undefined;
                    // if (agentConfig.toolOptions && Object.values(agentConfig.toolOptions).some(v => v === true)) {
                    //     toolsForAgent = createToolSet(agentConfig.toolOptions);
                    // }

                    // Execute Worker Agent
                    const { object: output, usage: agentUsage, finishReason: agentFinishReason, warnings: agentWarnings } = await generateObject({
                        model: openai(agentConfig.model || 'gpt-4o'), // Use agent model or default
                        schema: AgentOutputSchema,
                        system: agentConfig.systemPrompt,
                        prompt: workerPrompt,
                        temperature: agentConfig.temperature,
                        maxTokens: agentConfig.maxTokens,
                        maxRetries: 1,
                        // tools: toolsForAgent // Pass tools if defined
                    });

                    const stepDurationMs = Date.now() - stepStartTime;
                    this.logger.info(`Step ${i} (${step.agent}) completed successfully`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_step_success',
                        operationId, step: i, agent: step.agent, stepLogId, durationMs: stepDurationMs,
                        usage: agentUsage, finishReason: agentFinishReason,
                        needsRevision: output.metadata.needsRevision
                    });

                    context[i] = output;
                    madeProgress = true;

                    // --- Handle Re-planning ---
                    if (output.metadata.needsRevision) {
                        this.logger.warn(`Step ${i} (${step.agent}) flagged for revision. Initiating re-planning.`, {
                            category: LOG_CATEGORIES.ORCHESTRATOR, operationId, step: i, agent: step.agent, important: true
                        });
                        const replanStartTime = Date.now();
                        try {
                            const availableSpecializedAgents = AVAILABLE_AGENT_TYPES.filter(a => a !== 'default').join(', ');
                            const replanSystemPrompt = `You are the workflow manager. Adjust the workflow based on agent feedback. You can modify steps, add new steps (e.g., a copyeditor step), or re-order tasks. Available agents: ${availableSpecializedAgents}.`;
                            const replanPrompt = `Step ${i} (${step.agent}) requires revision. Issues: ${output.metadata.issues?.join(', ') || 'None'}. Result: ${output.result.substring(0, 200)}...\nCurrent plan: ${JSON.stringify(currentPlan.steps.map(s => s.agent))}\nProvide an updated plan (max 5 steps) to address the issue for the goal: "${initialRequest}"`;

                            const { object: revisedPlanData } = await generateObject({
                                model: this.orchestratorModel,
                                schema: WorkflowPlanSchema,
                                system: replanSystemPrompt,
                                prompt: replanPrompt,
                                maxRetries: 1,
                            });

                            // Validate new plan
                            if (!revisedPlanData.steps || revisedPlanData.steps.length === 0 || revisedPlanData.steps.some(step => !AVAILABLE_AGENT_TYPES.includes(step.agent))) {
                                throw new Error("Re-planning generated an invalid or empty plan.");
                            }

                            this.logger.info('Re-planning successful', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, newStepCount: revisedPlanData.steps.length });

                            currentPlan = revisedPlanData;
                            context = {}; // Reset context
                            planChangedThisIteration = true;
                            madeProgress = false;
                            allStepsComplete = false;
                            this.logger.warn('Workflow plan updated. Resetting context and restarting iteration.', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });

                        } catch (replanError) {
                            this.logger.error('Re-planning failed', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, error: replanError, important: true });
                            allStepsComplete = false;
                        }
                    }
                } catch (error) {
                    const stepDurationMs = Date.now() - stepStartTime;
                    this.logger.error(`Error executing Step ${i} (${step.agent})`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_step_error',
                        operationId, step: i, agent: step.agent, stepLogId, durationMs: stepDurationMs,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        important: true,
                    });
                    allStepsComplete = false;
                }
            } // End for loop (steps)

            const iterDurationMs = Date.now() - iterStartTime;
            if (planChangedThisIteration) {
                this.logger.info(`Plan changed in iteration ${iteration + 1}. Restarting loop.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });
                continue;
            }

            if (allStepsComplete) {
                this.logger.info(`All steps completed in iteration ${iteration + 1}.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });
                break;
            }
            if (!madeProgress) {
                this.logger.warn(`No progress made in iteration ${iteration + 1}. Aborting.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, important: true });
                break;
            }
            this.logger.info(`Finished execution iteration ${iteration + 1}`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });

            iteration++;
            if (iteration >= currentPlan.maxIterations) {
                this.logger.warn(`Max iterations (${currentPlan.maxIterations}) reached. Aborting.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, important: true });
                break;
            }
        } // End while loop (iterations)

        const execDurationMs = Date.now() - execStartTime;
        this.logger.info('Finished workflow plan execution', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, durationMs: execDurationMs });

        return { context, finalPlan: currentPlan };
    }

    /**
     * Compiles the results, assuming the last completed step has the final output.
     */
    compileResults(context: WorkflowContext, finalPlan: WorkflowPlan): string {
        this.logger.info('Compiling results', { category: LOG_CATEGORIES.ORCHESTRATOR });

        if (!finalPlan.steps || finalPlan.steps.length === 0) { return "Error: Plan was empty."; }

        let lastCompletedStepIndex = -1;
        for (let i = finalPlan.steps.length - 1; i >= 0; i--) {
            if (context[i]) {
                lastCompletedStepIndex = i;
                break;
            }
        }

        if (lastCompletedStepIndex !== -1) {
            this.logger.info(`Using result from last completed step (${lastCompletedStepIndex})`, { category: LOG_CATEGORIES.ORCHESTRATOR });
            return context[lastCompletedStepIndex].result;
        } else {
            this.logger.warn(`No steps completed successfully.`, { category: LOG_CATEGORIES.ORCHESTRATOR });
            return "Error: Workflow failed to produce a result.";
        }
    }

    /**
     * Runs the full orchestration process.
     */
    async run(request: string, initialAgentType?: AgentType): Promise<OrchestratorResult> {
        const operationId = `run_${Date.now().toString(36)}`;
        const startTime = Date.now();
        this.logger.info('Orchestrator run started', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'run_start',
            operationId,
            requestPreview: request.substring(0, 100) + '...',
        });

        try {
            const initialPlan = await this.generatePlan(request, initialAgentType);
            const { context, finalPlan } = await this.executePlan(initialPlan, request);
            const finalResultString = this.compileResults(context, finalPlan);

            const result: OrchestratorResult = {
                finalResult: finalResultString,
                stepsTakenDetails: context,
                finalPlan: finalPlan
            };

            OrchestratorResultSchema.parse(result); // Validate final output

            this.logger.info('Orchestrator run finished successfully', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'run_success',
                operationId,
                durationMs: Date.now() - startTime,
            });
            return result;
        } catch (error) {
            this.logger.error('Orchestrator run failed', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'run_error',
                operationId,
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true,
            });
            throw error; // Propagate error up
        }
    }
}