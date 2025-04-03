import { z } from 'zod';
// Import both the type and the runtime array
import { AgentType, AVAILABLE_AGENT_TYPES } from '../prompts';
// Add Message type import
import type { Message } from 'ai';

// Zod enum for agent types (dynamically created from the runtime array)
// Ensure the array is treated as non-empty for Zod's enum
const agentTypeValues = AVAILABLE_AGENT_TYPES as [string, ...string[]];
const AgentTypeEnum = z.enum(agentTypeValues);

// Schema for a single step in the workflow plan
export const WorkflowStepSchema = z.object({
    agent: AgentTypeEnum,
    task: z.string().describe("Specific instructions for the agent for this step."),
    dependsOn: z.array(z.number()).optional().describe("Indices of steps (0-based) that must be completed before this step can start."),
});

// Schema for the overall workflow plan
export const WorkflowPlanSchema = z.object({
    steps: z.array(WorkflowStepSchema).describe("Sequence of steps to execute."),
    maxIterations: z.number().default(5).describe("Maximum iterations to prevent infinite loops during re-planning."),
});

// Schema for the output expected from each agent worker
// Note: Validator agent might have a more specific output schema later
export const AgentOutputSchema = z.object({
    result: z.string().describe("The main output content generated by the agent."),
    metadata: z.object({
        qualityScore: z.number().min(1).max(10).optional().describe("Agent's self-assessment of output quality (1-10)."),
        needsRevision: z.boolean().describe("Flag indicating if the agent believes its output needs review or revision."),
        issues: z.array(z.string()).optional().describe("Specific issues identified if revision is needed."),
    }).describe("Metadata about the agent's execution and output quality."),
});

// Type for the context object storing results from completed steps
export type WorkflowContext = Record<number, z.infer<typeof AgentOutputSchema>>;

// Schema for the final result returned by the orchestrator run
export const OrchestratorResultSchema = z.object({
    finalResult: z.string().describe("The compiled final result from the workflow."),
    stepsTakenDetails: z.record(AgentOutputSchema).describe("Detailed outputs from each completed step, indexed by step number."), // Using z.record for type safety
    finalPlan: WorkflowPlanSchema.describe("The final version of the workflow plan that was executed.")
});

// Interface for the OrchestratedResponse returned by ChatSetupService
export interface OrchestratedResponse {
    type: 'orchestrated';
    data: z.infer<typeof OrchestratorResultSchema>;
}

// Type alias for the plan schema inference
export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;
// Type alias for the step schema inference
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
// Type alias for the agent output schema inference
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
// Type alias for the orchestrator result schema inference
export type OrchestratorResult = z.infer<typeof OrchestratorResultSchema>;

// New Type for Context Preparation Flow
export interface OrchestrationContext {
    targetModelId: string; // Model ID for the final streamText call
    finalSystemPrompt?: string; // Optional override for streamText system prompt
    contextMessages?: Array<Message>; // Messages (e.g., tool results) gathered during orchestration
    // Add other relevant context fields as needed
    planSummary?: string[]; // e.g., list of agent types used in the plan
}

// Wrapper type used by ChatSetupService to differentiate return types
export interface OrchestratedResponse {
    type: 'orchestrated';
    data: OrchestratorResult; // This might need adjustment if ChatSetupService changes
} 