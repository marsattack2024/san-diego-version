import { z } from 'zod';
import { openai } from '@ai-sdk/openai'; // Assuming OpenAI is configured
import { generateObject, LanguageModel } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { AgentType, AVAILABLE_AGENT_TYPES } from '../prompts';
import { getAgentConfig } from '../agent-router'; // Assuming this provides AgentConfig
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

export class AgentOrchestrator {
    private logger = edgeLogger;
    private orchestratorModel: LanguageModel;

    constructor() {
        // TODO: Make model configurable if needed
        this.orchestratorModel = openai('gpt-4o-mini');
        this.logger.info('AgentOrchestrator initialized', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            model: this.orchestratorModel.modelId, // Access modelId if available
        });
    }

    /**
     * Generates the initial workflow plan based on the user request.
     * @param request The initial user request or goal.
     * @param initialAgentType Optional hint for the first agent.
     * @returns A promise resolving to the workflow plan.
     */
    async generatePlan(request: string, initialAgentType?: AgentType): Promise<WorkflowPlan> {
        const operationId = `plan_${Date.now().toString(36)}`;
        const startTime = Date.now();
        this.logger.info('Generating workflow plan', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'generate_plan',
            operationId,
            requestPreview: request.substring(0, 100) + '...',
            initialAgentHint: initialAgentType,
        });

        try {
            const systemPrompt = `You are a marketing workflow manager. Plan a sequence of agent tasks based on the request. Define clear tasks and dependencies between steps. Available agents: ${AVAILABLE_AGENT_TYPES.join(', ')}. The plan should consist of 1 to 5 steps.`;
            const prompt = `Analyze this request and create a detailed workflow plan to fulfill it: "${request}"${initialAgentType ? ` Consider starting with the ${initialAgentType} agent.` : ''}`;

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
                usage,
                finishReason,
                warnings,
            });

            // Basic validation
            if (!plan.steps || plan.steps.length === 0) {
                this.logger.error('Generated plan has no steps', {
                    category: LOG_CATEGORIES.ORCHESTRATOR,
                    operationId
                });
                throw new Error('Generated workflow plan is empty.');
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
     * @param plan The workflow plan to execute.
     * @param initialRequest The original user request for context.
     * @returns A promise resolving to an object containing the final context and the final plan (which might have been modified).
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
        let currentPlan = { ...plan }; // Clone plan to allow modification

        while (iteration < currentPlan.maxIterations) {
            const iterStartTime = Date.now();
            this.logger.info(`Starting execution iteration ${iteration + 1}/${currentPlan.maxIterations}`, {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'execute_iteration_start',
                operationId,
                iteration: iteration + 1,
                currentStepCount: currentPlan.steps.length,
                completedSteps: Object.keys(context).length,
            });

            let madeProgress = false;
            let allStepsComplete = true;

            for (let i = 0; i < currentPlan.steps.length; i++) {
                const step = currentPlan.steps[i];
                const stepLogId = `${operationId}_step_${i}`; // Unique ID for this step attempt

                if (context[i]) { // Skip if already completed
                    continue;
                }

                allStepsComplete = false; // Found an incomplete step

                // Check dependencies
                const dependenciesMet = !step.dependsOn || step.dependsOn.every(depIndex => context[depIndex]);
                if (!dependenciesMet) {
                    this.logger.debug(`Step ${i} (${step.agent}) dependencies not met`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, step: i, agent: step.agent, dependencies: step.dependsOn });
                    continue;
                }

                // Execute the Step
                this.logger.info(`Executing Step ${i}: Agent=${step.agent}`, {
                    category: LOG_CATEGORIES.ORCHESTRATOR,
                    operation: 'execute_step_start',
                    operationId,
                    step: i,
                    agent: step.agent,
                    taskPreview: step.task.substring(0, 50) + '...',
                    stepLogId
                });
                const stepStartTime = Date.now();

                try {
                    // Re-adding explicit cast as workaround for persistent linter error
                    const agentConfig = getAgentConfig(step.agent as AgentType);
                    if (!agentConfig) throw new Error(`Agent configuration not found for type: ${step.agent}`);

                    // TODO: Implement smarter context summarization/selection
                    const relevantContextString = JSON.stringify(context); // Simple for now
                    const workerPrompt = `Initial Request: "${initialRequest}"\n\nRelevant previous step results:\n${relevantContextString}\n\nYour Task: ${step.task}`;

                    const { object: output, usage: agentUsage, finishReason: agentFinishReason, warnings: agentWarnings } = await generateObject({
                        // Revert: Pass the LanguageModel object, not just the ID string
                        model: openai(agentConfig.model || 'gpt-4o'),
                        schema: AgentOutputSchema, // Assuming a general output schema for now
                        system: agentConfig.systemPrompt,
                        prompt: workerPrompt,
                        temperature: agentConfig.temperature,
                        maxTokens: agentConfig.maxTokens, // Now available from config
                        maxRetries: 1, // Limit retries for individual workers
                        // TODO: Consider passing agent-specific tools if needed
                    });

                    const stepDurationMs = Date.now() - stepStartTime;
                    this.logger.info(`Step ${i} (${step.agent}) completed successfully`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR,
                        operation: 'execute_step_success',
                        operationId, step: i, agent: step.agent, stepLogId,
                        durationMs: stepDurationMs, usage: agentUsage, finishReason: agentFinishReason,
                        warnings: agentWarnings, needsRevision: output.metadata.needsRevision,
                        qualityScore: output.metadata.qualityScore,
                    });

                    context[i] = output;
                    madeProgress = true;

                    // Handle Re-planning if needed
                    if (output.metadata.needsRevision) {
                        this.logger.warn(`Step ${i} (${step.agent}) flagged for revision. Initiating re-planning.`, {
                            category: LOG_CATEGORIES.ORCHESTRATOR,
                            operation: 'replan_triggered',
                            operationId, step: i, agent: step.agent, stepLogId,
                            issues: output.metadata.issues, important: true,
                        });

                        const replanStartTime = Date.now();
                        try {
                            const replanSystemPrompt = `You are the workflow manager. Adjust the workflow based on agent feedback. You can modify steps, add new steps (e.g., a validator step), or re-order tasks. Explain your reasoning clearly if possible in the plan. Available agents: ${AVAILABLE_AGENT_TYPES.join(', ')}.`;
                            const replanPrompt = `Step ${i} (${step.agent}) requires revision. Issues reported: ${output.metadata.issues?.join(', ') || 'None specified'}. Result provided: ${output.result.substring(0, 200)}...
Current workflow plan: ${JSON.stringify(currentPlan)}
Please provide an updated plan (max 5 steps) to address the issue and achieve the original goal: "${initialRequest}"`;

                            const { object: revisedPlanData, usage: replanUsage } = await generateObject({
                                model: this.orchestratorModel,
                                schema: WorkflowPlanSchema,
                                system: replanSystemPrompt,
                                prompt: replanPrompt,
                                maxRetries: 1,
                            });

                            const replanDurationMs = Date.now() - replanStartTime;
                            this.logger.info('Re-planning successful', {
                                category: LOG_CATEGORIES.ORCHESTRATOR,
                                operation: 'replan_success',
                                operationId,
                                stepTriggeringReplan: i,
                                durationMs: replanDurationMs,
                                newStepCount: revisedPlanData.steps.length,
                                usage: replanUsage,
                            });

                            currentPlan = revisedPlanData; // Update the plan
                            context = {}; // Reset context (simple strategy)
                            this.logger.warn('Workflow plan updated. Resetting context and restarting iteration.', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });
                            madeProgress = false; // Don't count this iteration as making progress
                            allStepsComplete = false; // Ensure loop continues
                            break; // Restart iteration with new plan
                        } catch (replanError) {
                            const replanDurationMs = Date.now() - replanStartTime;
                            this.logger.error('Re-planning failed', {
                                category: LOG_CATEGORIES.ORCHESTRATOR,
                                operation: 'replan_error',
                                operationId,
                                stepTriggeringReplan: i,
                                durationMs: replanDurationMs,
                                error: replanError instanceof Error ? replanError.message : String(replanError),
                                important: true,
                            });
                            allStepsComplete = false; // Prevent premature termination
                        }
                    }
                } catch (error) {
                    const stepDurationMs = Date.now() - stepStartTime;
                    this.logger.error(`Error executing Step ${i} (${step.agent})`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR,
                        operation: 'execute_step_error',
                        operationId,
                        step: i,
                        agent: step.agent,
                        stepLogId,
                        durationMs: stepDurationMs,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        important: true, // Worker errors are important
                    });
                    // Strategy: Mark step as failed? Abort workflow? For now, log and continue iteration.
                    // context[i] = { result: `Error: ${error.message}`, metadata: { needsRevision: true, qualityScore: 1 }}; // Example: Mark as failed
                    allStepsComplete = false; // Prevent incorrect completion
                }
            } // End for loop (steps)

            // Check iteration outcome
            const iterDurationMs = Date.now() - iterStartTime;
            if (allStepsComplete) {
                this.logger.info(`All steps completed in iteration ${iteration + 1}. Finishing execution.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_iteration_complete', operationId, iteration: iteration + 1, durationMs: iterDurationMs });
                break; // Exit while loop
            }

            if (!madeProgress && !allStepsComplete) { // Check allStepsComplete here to avoid logging stall if plan just changed
                this.logger.warn(`No progress made in iteration ${iteration + 1}. Potential deadlock or unmet dependencies. Aborting execution.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_iteration_stalled', operationId, iteration: iteration + 1, durationMs: iterDurationMs, important: true });
                break; // Prevent infinite loops
            }

            this.logger.info(`Finished execution iteration ${iteration + 1}`, { category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_iteration_end', operationId, iteration: iteration + 1, durationMs: iterDurationMs, progressMade: madeProgress });

            iteration++;
            if (iteration >= currentPlan.maxIterations) {
                this.logger.warn(`Max iterations (${currentPlan.maxIterations}) reached. Aborting execution.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_max_iterations', operationId, iteration, important: true });
                break;
            }
        } // End while loop (iterations)

        const execDurationMs = Date.now() - execStartTime;
        this.logger.info('Finished workflow plan execution', { category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_plan_end', operationId, totalIterations: iteration, completedStepCount: Object.keys(context).length, durationMs: execDurationMs });

        // Return both context and the final plan state (might have changed due to re-planning)
        return { context, finalPlan: currentPlan };
    }

    /**
     * Compiles the results from the execution context into a final string.
     * @param context The context containing results from executed steps.
     * @param finalPlan The final version of the plan that was executed.
     * @returns A compiled string result.
     */
    compileResults(context: WorkflowContext, finalPlan: WorkflowPlan): string {
        this.logger.info('Compiling results', { category: LOG_CATEGORIES.ORCHESTRATOR });
        // Simple compilation: Join results of completed steps
        // TODO: Implement smarter compilation (e.g., LLM call) if needed
        let compiled = '';
        for (let i = 0; i < finalPlan.steps.length; i++) {
            if (context[i]) {
                compiled += `--- Output from Step ${i} (${finalPlan.steps[i].agent}) ---\n${context[i].result}\n\n`;
            } else {
                compiled += `--- Step ${i} (${finalPlan.steps[i].agent}) was not completed. ---

`;
            }
        }
        return compiled.trim();
    }

    /**
     * Runs the full orchestration process: plan, execute, compile.
     * @param request The initial user request.
     * @param initialAgentType Optional hint for the first agent.
     * @returns A promise resolving to the final orchestrator result.
     */
    async run(request: string, initialAgentType?: AgentType): Promise<OrchestratorResult> {
        const operationId = `run_${Date.now().toString(36)}`; // Unique ID for the whole run
        const startTime = Date.now();
        this.logger.info('Orchestrator run started', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'run_start',
            operationId,
            requestPreview: request.substring(0, 100) + '...',
        });

        try {
            const initialPlan = await this.generatePlan(request, initialAgentType);
            // Execute plan and get the final context and potentially updated plan
            const { context, finalPlan } = await this.executePlan(initialPlan, request);
            const finalResultString = this.compileResults(context, finalPlan);

            const result: OrchestratorResult = {
                finalResult: finalResultString,
                stepsTakenDetails: context,
                finalPlan: finalPlan // Use the final plan after potential re-planning
            };

            // Validate final result against schema (optional but good practice)
            OrchestratorResultSchema.parse(result);

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
            // Re-throw or handle appropriately depending on desired API behavior
            throw error; // Propagate error up
        }
    }
} 