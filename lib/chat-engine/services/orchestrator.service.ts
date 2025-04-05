import { z } from 'zod';
import { openai } from '@ai-sdk/openai'; // Assuming OpenAI is configured
import { generateObject, LanguageModel, Message } from 'ai';
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
    OrchestratorResult,
    OrchestrationContext
} from '../types/orchestrator';
// Import AI SDK tool type if needed for passing tools
import type { Tool } from 'ai';
// Import tool creation function if tools are passed dynamically
// import { createToolSet } from '@/lib/tools/registry.tool';

// Define thresholds based on logging-rules.mdc
// TODO: Move these to a shared constants file like @/lib/logger/constants.ts
const THRESHOLDS = {
    SLOW_OPERATION: 2000,    // 2 seconds
    IMPORTANT_THRESHOLD: 5000 // 5 seconds
    // Add other specific thresholds (e.g., RAG_TIMEOUT) if needed directly by the orchestrator
};

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
        const planGenStartTime = Date.now(); // Start timing for plan generation
        const availableSpecializedAgents = AVAILABLE_AGENT_TYPES.filter(a => a !== 'default').join(', ');

        this.logger.info('Generating workflow plan (incl. complexity assessment)', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'generate_plan',
            operationId,
            requestPreview: request.substring(0, 100) + '...',
            initialAgentHint: initialAgentType,
        });

        try {
            // Modified System Prompt for stricter agent selection
            const systemPrompt = `You are a highly intelligent workflow manager. Your tasks are:
1. Analyze the user request and any user agent hint provided.
2. Determine if the request is SIMPLE (can be answered directly by the 'default' agent, possibly using RAG/tools) or COMPLEX (requires specialized generation or multiple distinct steps).
3. Generate a workflow plan object based on your determination:
    - If SIMPLE (e.g., answering questions, researching topics, summarizing info, using tools directly): Create a plan with ONLY ONE step using the 'default' agent (or the user's hinted agent if appropriate) with the task: "Answer the user query directly using available context and tools."
    - If COMPLEX (e.g., user *explicitly* asks for marketing copy, ad campaigns, quizzes, or specific text editing): Create a detailed multi-step plan (typically 2-3 steps, max 5) using the most appropriate specialized agents. 
        - Use 'researcher' ONLY if significant external information gathering beyond simple tool calls is clearly needed as a distinct first step.
        - Use 'copywriting', 'google-ads', 'facebook-ads', 'quiz' ONLY when the user explicitly asks for that specific type of creative output.
        - Use 'copyeditor' ONLY when the user explicitly asks for text to be edited or refined, or if a previous generation step explicitly requires it.
        - Ensure the final step produces the user-facing output.
Available specialized agents: copywriting, google-ads, facebook-ads, quiz, researcher, copyeditor. 
STRONGLY PREFER the single 'default' agent plan unless a specialized generation agent is clearly and explicitly requested by the user.`;

            const prompt = `User Request: "${request}"
User Agent Hint: ${initialAgentType || 'default'}

Analyze this request and generate the appropriate workflow plan (either single-step simple or multi-step complex) based on your system instructions. Ensure the plan achieves the user's goal.`;

            // Log the prompt at debug level
            this.logger.debug('generatePlan: Prompt sent to model', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operationId,
                systemPrompt,
                prompt
            });

            const generateObjectStartTime = Date.now(); // Time the generateObject call
            const { object: plan, usage, finishReason, warnings } = await generateObject({
                model: this.orchestratorModel,
                schema: WorkflowPlanSchema,
                system: systemPrompt,
                prompt: prompt,
                maxRetries: 2,
            });
            const generateObjectDurationMs = Date.now() - generateObjectStartTime;

            // Calculate slow/important flags for the generateObject call
            const isGenObjSlow = generateObjectDurationMs > THRESHOLDS.SLOW_OPERATION;
            const isGenObjImportant = generateObjectDurationMs > THRESHOLDS.IMPORTANT_THRESHOLD;
            // Use specific logger level method
            (isGenObjSlow ? this.logger.warn : this.logger.info).call(this.logger, 'generatePlan: generateObject call completed', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'generate_plan_llm_call',
                operationId,
                durationMs: generateObjectDurationMs,
                slow: isGenObjSlow,
                important: isGenObjImportant,
                usage,
                finishReason,
                warnings,
            });

            const totalPlanGenDurationMs = Date.now() - planGenStartTime;
            const isTotalPlanSlow = totalPlanGenDurationMs > THRESHOLDS.SLOW_OPERATION;
            const isTotalPlanImportant = totalPlanGenDurationMs > THRESHOLDS.IMPORTANT_THRESHOLD;
            // Use specific logger level method
            (isTotalPlanSlow ? this.logger.warn : this.logger.info).call(this.logger, 'Workflow plan generation completed', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'generate_plan_success',
                operationId,
                durationMs: totalPlanGenDurationMs, // Log total duration
                stepCount: plan.steps.length,
                planPreview: JSON.stringify(plan.steps.map(s => s.agent)),
                slow: isTotalPlanSlow, // Add flags for total duration
                important: isTotalPlanImportant,
                llmDurationMs: generateObjectDurationMs // Include specific LLM call time
            });

            // Validate plan structure
            if (!plan.steps || plan.steps.length === 0) {
                throw new Error('Generated workflow plan is empty.');
            }
            if (plan.steps.some(step => !AVAILABLE_AGENT_TYPES.includes(step.agent as AgentType))) {
                const invalidAgent = plan.steps.find(step => !AVAILABLE_AGENT_TYPES.includes(step.agent as AgentType))?.agent;
                throw new Error(`Generated plan uses invalid agent type: ${invalidAgent}`);
            }

            return plan;
        } catch (error) {
            const durationMs = Date.now() - planGenStartTime;
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
     * Executes the workflow plan step-by-step to gather context.
     * Modified to return collected context messages and final config.
     */
    private async executePlanAndGatherContext(plan: WorkflowPlan, initialRequest: string):
        Promise<{ contextMessages: Message[], finalPlan: WorkflowPlan, targetModelId: string, finalSystemPrompt?: string }> {
        const operationId = `exec_ctx_${Date.now().toString(36)}`;
        const execStartTime = Date.now();
        this.logger.info('Executing workflow plan to gather context', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'execute_plan_context_start',
            operationId,
            stepCount: plan.steps.length
        });

        let iteration = 0;
        let currentPlan = { ...plan, steps: [...plan.steps] }; // Deep copy steps for modification
        let completedStepOutputs: Record<number, AgentOutput> = {}; // Store outputs temporarily (Use LET)
        const contextMessages: Message[] = []; // Collect messages to pass to final stream

        // Determine default target model - can be overridden by plan/logic later
        let targetModelId = getAgentConfig(currentPlan.steps[currentPlan.steps.length - 1].agent as AgentType)?.model || 'gpt-4o-mini';
        let finalSystemPrompt: string | undefined = undefined; // Default system prompt

        while (iteration < currentPlan.maxIterations) {
            const iterStartTime = Date.now();
            this.logger.info(`Starting context gathering iteration ${iteration + 1}/${currentPlan.maxIterations}`, {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operationId,
                iteration: iteration + 1
            });

            let madeProgress = false;
            let allStepsCompleteOrSkipped = true; // Assume completion
            let planChangedThisIteration = false;

            for (let i = 0; i < currentPlan.steps.length; i++) {
                if (planChangedThisIteration) break; // Restart iteration if plan changed

                const step = currentPlan.steps[i];
                const stepLogId = `${operationId}_step_${i}`;

                // Skip if already processed in this run
                if (completedStepOutputs[i]) { continue; }

                // Check dependencies based on temporary outputs
                const dependenciesMet = !step.dependsOn || step.dependsOn.every(depIndex => completedStepOutputs[depIndex]);
                if (!dependenciesMet) {
                    allStepsCompleteOrSkipped = false; // Mark as not yet complete
                    this.logger.debug(`Step ${i} (${step.agent}) dependencies not met`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, step: i });
                    continue;
                }

                // Check if this is potentially the *final* generation step defined in the plan
                // We might want to SKIP this step if the API route's streamText will handle it.
                // Decision: Let's assume for now the plan includes context steps ONLY.
                // If a plan *needs* an intermediate generation (e.g., summarize research),
                // that agent ('copywriter') should run.
                // The *very last* step of a plan might implicitly be the final streamText call.
                // TODO: Refine this logic - how do we know which step is the final generation?
                // Simple approach: If it's the last step, assume it's context for the API streamText.
                // Let's try executing all steps defined in the plan for now, and add their outputs as context.

                this.logger.info(`Executing Step ${i}: Agent=${step.agent} for context`, {
                    category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_step_context_start',
                    operationId, step: i, agent: step.agent, stepLogId
                });
                const stepStartTime = Date.now();

                try {
                    const agentConfig = getAgentConfig(step.agent as AgentType);
                    if (!agentConfig) throw new Error(`Agent configuration not found for type: ${step.agent}`);

                    // Prepare context string from *previous* completed steps
                    let workerContextInput = `Initial Request: "${initialRequest}"\n`;
                    if (step.dependsOn && step.dependsOn.length > 0) {
                        workerContextInput += "\nRelevant previous step results:\n";
                        step.dependsOn.forEach(depIndex => {
                            if (completedStepOutputs[depIndex]) {
                                workerContextInput += `--- Output from Step ${depIndex} (${currentPlan.steps[depIndex]?.agent}) ---\n${completedStepOutputs[depIndex].result}\n\n`;
                            }
                        });
                    }
                    const workerPrompt = `${workerContextInput}\n\nYour Task: ${step.task}`;

                    // Log the prompt for this specific step at debug level
                    this.logger.debug(`executePlan Step ${i}: Prompt sent to agent`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR,
                        operationId,
                        step: i,
                        stepLogId,
                        agent: step.agent,
                        systemPrompt: agentConfig.systemPrompt,
                        workerPrompt
                    });

                    // Execute Worker Agent - Time this specific call
                    const generateObjectStepStartTime = Date.now();
                    const { object: output, usage: agentUsage, finishReason: agentFinishReason } = await generateObject({
                        model: openai(agentConfig.model || 'gpt-mini'),
                        schema: AgentOutputSchema,
                        system: agentConfig.systemPrompt,
                        prompt: workerPrompt,
                        temperature: agentConfig.temperature,
                        maxTokens: agentConfig.maxTokens,
                        maxRetries: 1,
                    });
                    const generateObjectStepDurationMs = Date.now() - generateObjectStepStartTime;

                    // Calculate slow/important for this specific agent call
                    const isGenObjStepSlow = generateObjectStepDurationMs > THRESHOLDS.SLOW_OPERATION;
                    const isGenObjStepImportant = generateObjectStepDurationMs > THRESHOLDS.IMPORTANT_THRESHOLD;
                    // Use specific logger level method
                    (isGenObjStepSlow ? this.logger.warn : this.logger.info).call(this.logger, `executePlan Step ${i}: generateObject call completed`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR,
                        operation: 'execute_step_llm_call',
                        operationId,
                        step: i,
                        stepLogId,
                        agent: step.agent,
                        durationMs: generateObjectStepDurationMs,
                        slow: isGenObjStepSlow,
                        important: isGenObjStepImportant,
                        usage: agentUsage,
                        finishReason: agentFinishReason
                    });

                    // Calculate timing for the overall step (including overhead)
                    const stepDurationMs = Date.now() - stepStartTime;
                    const isStepSlow = stepDurationMs > THRESHOLDS.SLOW_OPERATION;
                    const isStepImportant = stepDurationMs > THRESHOLDS.IMPORTANT_THRESHOLD;
                    // Use specific logger level method
                    (isStepSlow ? this.logger.warn : this.logger.info).call(this.logger, `Step ${i} (${step.agent}) context gathered successfully`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR,
                        operation: 'execute_step_context_success',
                        operationId,
                        step: i,
                        agent: step.agent,
                        stepLogId,
                        durationMs: stepDurationMs, // Total step duration
                        llmDurationMs: generateObjectStepDurationMs, // Specific LLM call duration
                        usage: agentUsage,
                        finishReason: agentFinishReason,
                        needsRevision: output.metadata.needsRevision,
                        slow: isStepSlow, // Flags for total step duration
                        important: isStepImportant,
                    });

                    // Store output for dependency tracking
                    completedStepOutputs[i] = output;
                    madeProgress = true;

                    // Add result as context message for the final stream
                    // Format: Use assistant role to represent intermediate results
                    contextMessages.push({
                        id: `ctx_${operationId}_${i}`,
                        role: 'assistant',
                        content: `Context from ${step.agent}: ${output.result}`,
                        // TODO: Should we include tool call info here if the agent used tools?
                    });

                    // If the last agent executed has a specific system prompt, maybe use it?
                    if (i === currentPlan.steps.length - 1 && agentConfig.systemPrompt) {
                        // Potentially override the default system prompt for the final stream
                        // finalSystemPrompt = agentConfig.systemPrompt;
                        // Also update the target model based on this last agent
                        targetModelId = agentConfig.model || targetModelId;
                    }

                    // --- Handle Re-planning (Keep this logic) ---
                    if (output.metadata.needsRevision) {
                        this.logger.warn(`Step ${i} (${step.agent}) flagged for revision. Initiating re-planning.`, {
                            category: LOG_CATEGORIES.ORCHESTRATOR, operationId, step: i, agent: step.agent, important: true
                        });
                        // ... (Re-planning logic remains the same) ...
                        // Reset completedStepOutputs and contextMessages if plan changes
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
                            if (!revisedPlanData.steps || revisedPlanData.steps.length === 0 || revisedPlanData.steps.some(step => !AVAILABLE_AGENT_TYPES.includes(step.agent as AgentType))) {
                                throw new Error("Re-planning generated an invalid or empty plan.");
                            }

                            this.logger.info('Re-planning successful', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, newStepCount: revisedPlanData.steps.length });

                            currentPlan = revisedPlanData;
                            completedStepOutputs = {}; // Reset completed steps (OK with LET)
                            contextMessages.length = 0; // Clear context messages
                            planChangedThisIteration = true;
                            madeProgress = false;
                            allStepsCompleteOrSkipped = false;
                            this.logger.warn('Workflow plan updated. Resetting context and restarting iteration.', { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });

                        } catch (replanError) {
                            const replanStartTime = Date.now(); // Should be defined before try block
                            const replanDurationMs = Date.now() - replanStartTime;
                            this.logger.error('Re-planning failed', {
                                category: LOG_CATEGORIES.ORCHESTRATOR,
                                operationId,
                                stepTriggeringReplan: i,
                                durationMs: replanDurationMs,
                                error: replanError instanceof Error ? replanError.message : String(replanError),
                                important: true // Error is always important
                            });
                            allStepsCompleteOrSkipped = false; // Prevent premature termination if re-plan fails
                        }
                    }
                } catch (error) {
                    const stepDurationMs = Date.now() - stepStartTime;
                    this.logger.error(`Error executing Step ${i} (${step.agent}) for context`, {
                        category: LOG_CATEGORIES.ORCHESTRATOR, operation: 'execute_step_context_error',
                        operationId, step: i, agent: step.agent, stepLogId, durationMs: stepDurationMs,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        important: true,
                    });
                    allStepsCompleteOrSkipped = false; // Mark as incomplete on error
                    // Decide if we should continue other steps or abort context gathering
                    // For now, let's allow other independent branches to continue
                }
            } // End for loop (steps)

            const iterDurationMs = Date.now() - iterStartTime;
            if (planChangedThisIteration) {
                this.logger.info(`Plan changed in iteration ${iteration + 1}. Restarting loop.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });
                continue; // Go to next iteration immediately
            }

            // Check for completion or lack of progress
            if (allStepsCompleteOrSkipped) {
                this.logger.info(`All context gathering steps completed or skipped in iteration ${iteration + 1}.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId });
                break; // Exit loop
            }
            if (!madeProgress) {
                this.logger.warn(`No progress made in context gathering iteration ${iteration + 1}. Aborting.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, important: true });
                break; // Exit loop
            }

            this.logger.info(`Finished context gathering iteration ${iteration + 1}`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, durationMs: iterDurationMs });

            iteration++;
            if (iteration >= currentPlan.maxIterations) {
                this.logger.warn(`Max iterations (${currentPlan.maxIterations}) reached for context gathering. Aborting.`, { category: LOG_CATEGORIES.ORCHESTRATOR, operationId, important: true });
                break;
            }
        } // End while loop (iterations)

        const execDurationMs = Date.now() - execStartTime;
        this.logger.info('Finished workflow plan execution for context gathering', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operationId,
            durationMs: execDurationMs,
            contextMessageCount: contextMessages.length,
            slow: execDurationMs > THRESHOLDS.SLOW_OPERATION,
            important: execDurationMs > THRESHOLDS.IMPORTANT_THRESHOLD,
        });

        return { contextMessages, finalPlan: currentPlan, targetModelId, finalSystemPrompt };
    }

    /**
     * Prepares the context for the final streaming call by the API route.
     * This involves planning and potentially executing steps to gather information.
     * Optimization: Skips execution for simple ["default"] plans.
     */
    async prepareContext(request: string, initialAgentType?: AgentType): Promise<OrchestrationContext> {
        const operationId = `prep_ctx_${Date.now().toString(36)}`;
        const startTime = Date.now();
        this.logger.info('Orchestrator prepareContext started', {
            category: LOG_CATEGORIES.ORCHESTRATOR,
            operation: 'prepare_context_start',
            operationId,
            requestPreview: request.substring(0, 100) + '...',
        });

        try {
            // Step 1: Generate the plan
            const initialPlan = await this.generatePlan(request, initialAgentType);
            const isSimpleDefaultPlan = initialPlan.steps.length === 1 && initialPlan.steps[0].agent === 'default';

            // Step 2: Check if plan is simple default
            if (isSimpleDefaultPlan) {
                // Optimization: Skip execution for simple default plan
                this.logger.info('Simple ["default"] plan detected. Skipping synchronous execution step.', {
                    category: LOG_CATEGORIES.ORCHESTRATOR,
                    operation: 'prepare_context_skip_execution',
                    operationId,
                    planPreview: ['default']
                });

                // Get default agent config to determine the target model
                const defaultConfig = getAgentConfig('default');
                const durationMs = Date.now() - startTime;

                const result: OrchestrationContext = {
                    targetModelId: defaultConfig.model || 'gpt-4o-mini', // Use default agent model
                    contextMessages: [], // No context messages generated
                    planSummary: ['default']
                    // finalSystemPrompt is intentionally omitted - API route will handle it
                };

                this.logger.info('Orchestrator prepareContext finished successfully (Simple Plan)', {
                    category: LOG_CATEGORIES.ORCHESTRATOR,
                    operation: 'prepare_context_success',
                    operationId,
                    durationMs,
                    contextMessageCount: 0,
                    targetModelId: result.targetModelId,
                    planType: 'simple'
                });
                return result;

            } else {
                // Complex Plan: Execute plan to gather context
                this.logger.info('Complex plan detected. Executing steps to gather context.', {
                    category: LOG_CATEGORIES.ORCHESTRATOR,
                    operation: 'prepare_context_execute_plan',
                    operationId,
                    planPreview: initialPlan.steps.map(s => s.agent)
                });

                // Call the original execution logic
                // Destructure without finalSystemPrompt as it's handled by API route
                const { contextMessages, finalPlan, targetModelId } = await this.executePlanAndGatherContext(initialPlan, request);

                // Assemble the final OrchestrationContext
                const result: OrchestrationContext = {
                    targetModelId,
                    contextMessages,
                    planSummary: finalPlan.steps.map(s => s.agent)
                    // finalSystemPrompt omitted
                };

                const durationMs = Date.now() - startTime;
                const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
                const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;
                (isSlow ? this.logger.warn : this.logger.info).call(this.logger, 'Orchestrator prepareContext finished successfully (Complex Plan)', {
                    category: LOG_CATEGORIES.ORCHESTRATOR,
                    operation: 'prepare_context_success',
                    operationId,
                    durationMs,
                    contextMessageCount: contextMessages.length,
                    targetModelId: result.targetModelId,
                    planType: 'complex',
                    slow: isSlow,
                    important: isImportant,
                });
                return result;
            }
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error('Orchestrator prepareContext failed', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operation: 'prepare_context_error',
                operationId,
                durationMs: durationMs,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true,
            });
            // Re-throw the error to be handled by the API route
            throw error;
        }
    }

    // --- Deprecated Methods (Commented out for now) ---
    /*
    compileResults(context: WorkflowContext, finalPlan: WorkflowPlan): string {
        // ... (old implementation) ...
    }

    async run(request: string, initialAgentType?: AgentType): Promise<OrchestratorResult> {
        // ... (old implementation) ...
    }
    */
}