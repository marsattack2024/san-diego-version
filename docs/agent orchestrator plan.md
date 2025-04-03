# Plan: Implement AI Workflow Orchestrator

**Goal:** Integrate a flexible, multi-step AI workflow orchestrator into the existing chat engine (`lib/chat-engine`), leveraging the Vercel AI SDK (`ai` package) for dynamic routing and agent execution, following the Orchestrator-Worker pattern. This will replace the initial plan based on the "GROX idea" and integrate directly with our current architecture.

**Phase 1: Core Orchestrator Logic & Types**

*   **Objective:** Build the foundational components of the orchestrator service and define necessary data structures.

1.  **Define Orchestrator Types (`lib/chat-engine/types/orchestrator.ts`):**
    *   Create a new file `orchestrator.ts` within `lib/chat-engine/types/`.
    *   Define core interfaces and Zod schemas:
        *   `AgentConfig`: Reuse or adapt from `lib/chat-engine/agent-router.ts`.
        *   `AgentType`: Import from `lib/chat-engine/prompts/index.ts`. **Update this enum to include `validator` and `researcher`.**
        *   `WorkflowStepSchema`: `z.object({ agent: z.nativeEnum(AgentType), task: z.string(), dependsOn: z.array(z.number()).optional() })`.
        *   `WorkflowPlanSchema`: `z.object({ steps: z.array(WorkflowStepSchema), maxIterations: z.number().default(5) })`.
        *   `AgentOutputSchema`: `z.object({ result: z.string(), metadata: z.object({ qualityScore: z.number().min(1).max(10), needsRevision: z.boolean(), issues: z.array(z.string()).optional() }) })`.
        *   `WorkflowContext`: `Record<number, z.infer<typeof AgentOutputSchema>>`.
        *   `OrchestratorResult`: `z.object({ finalResult: z.string(), stepsTakenDetails: WorkflowContext, finalPlan: z.infer<typeof WorkflowPlanSchema> })`.

2.  **Create Orchestrator Service (`lib/chat-engine/services/orchestrator.service.ts`):**
    *   Create the new service file `orchestrator.service.ts` within `lib/chat-engine/services/`.
    *   Implement the `AgentOrchestrator` class.
    *   **Dependencies:** Inject `edgeLogger`.
    *   **`generatePlan` Method:**
        *   Accepts `request: string`, optionally `initialAgentType: AgentType`.
        *   Uses `generateObject` with `openai('gpt-4o-mini')` (or similar) and `workflowPlanSchema`.
        *   System Prompt: **Update** to include new agents: "You are a marketing workflow manager... Available agents: default, copywriting, google-ads, facebook-ads, quiz, **validator, researcher**".
        *   Prompt: `Analyze this request and create a detailed workflow plan: "${request}"`.
        *   Log plan generation details (usage, duration) using `edgeLogger` following `logging-rules.mdc`.
        *   Returns `Promise<z.infer<typeof WorkflowPlanSchema>>`.
    *   **`executePlan` Method:**
        *   Accepts `plan: z.infer<typeof WorkflowPlanSchema>`, `initialRequest: string`.
        *   Initializes `context: WorkflowContext = {}`, `iteration = 0`, `currentPlan = plan`.
        *   Implements the main execution loop (`while (iteration < currentPlan.maxIterations)`):
            *   Iterates through `currentPlan.steps`.
            *   Checks dependencies and completion status (`context[stepIndex]`).
            *   If executable:
                *   Retrieves agent config using `getAgentConfig` from `agent-router.ts`. **Note:** Need to add configurations for `validator` and `researcher` in `agent-router.ts` (defining their models, prompts, and potential tool access - researcher likely needs web/deep search tools).
                *   Prepares worker prompt (system prompt, task, relevant context).
                *   Executes worker using `generateObject` with agent's model and `agentOutputSchema`. **Note:** The `validator` agent might need a different output schema focused on evaluation metrics.
                *   Logs worker execution details.
                *   Stores output in `context`.
                *   Handles re-planning if `output.metadata.needsRevision` (especially useful after a `validator` step):
                    *   Calls `generateObject` with orchestrator model to get `revisedPlanData`.
                    *   Updates `currentPlan`, resets `context`, logs re-planning, breaks inner loop.
                *   Implements `try...catch` for worker execution errors, logs errors.
            *   Checks for loop termination conditions (all steps complete, no progress, max iterations).
        *   Returns `Promise<WorkflowContext>`.
    *   **`compileResults` Method:**
        *   Accepts `context: WorkflowContext`, `finalPlan: z.infer<typeof WorkflowPlanSchema>`.
        *   Compiles `result` strings from `context` into a final output string.
        *   Returns `string`.
    *   **`run` Method (Main Entry Point):**
        *   Accepts `request: string`, optionally `initialAgentType: AgentType`.
        *   Calls `generatePlan`, `executePlan`, `compileResults`.
        *   Logs overall orchestration start/end and duration.
        *   Returns `Promise<z.infer<typeof OrchestratorResult>>`.

**Phase 2: Integration into Chat Engine**

*   **Objective:** Connect the orchestrator service to the existing chat request flow.

3.  **Modify `ChatSetupService` (`lib/chat-engine/chat-setup.service.ts`):**
    *   Inject `AgentOrchestrator` dependency.
    *   **Enhance `prepareConfig`:**
        *   Define a clear trigger for orchestration (e.g., specific request flag `useOrchestrator: true`, complex query classification via LLM, specific agent selection).
        *   **If Orchestration Triggered**:
            *   Call `await this.agentOrchestrator.run(...)`.
            *   Define `OrchestratedResponse` interface (e.g., `{ type: 'orchestrated', data: OrchestratorResult }`).
            *   Return this `OrchestratedResponse`.
        *   **Else (Single Agent)**: Return standard `ChatEngineConfig`.
    *   Update `prepareConfig` return type: `Promise<ChatEngineConfig | OrchestratedResponse>`.

4.  **Update API Route (`app/api/chat/route.ts`):**
    *   **Modify `POST` Handler:**
        *   After `const engineSetupResult = await chatSetupService.prepareConfig(...)`.
        *   Check the type of `engineSetupResult`: `if ('type' in engineSetupResult && engineSetupResult.type === 'orchestrated')`.
        *   **If Orchestrated**:
            *   Log orchestration completion.
            *   Use `successResponse` (from `lib/utils/route-handler.ts`) to return the `engineSetupResult.data` as a JSON payload (non-streaming).
            *   Address message persistence implications for orchestrated flows (potentially log the final result or key steps).
        *   **Else (Standard `ChatEngineConfig`)**:
            *   Proceed with `createChatEngine(engineSetupResult)` and `engine.handleRequest(...)` for streaming.
    *   Ensure adherence to `routing-rules.mdc` for responses and error handling.

**Phase 3: Refinement & Testing**

*   **Objective:** Improve robustness, observability, and validate the implementation.

5.  **Logging & Observability:**
    *   Review and enhance logging across all new/modified components (`AgentOrchestrator`, `ChatSetupService`, API route) using `edgeLogger`.
    *   Ensure logs include relevant IDs (operation, session, tool call), durations, agent types, decisions, errors, and token usage, following `logging-rules.mdc`.

6.  **Error Handling:**
    *   Implement robust `try...catch` blocks around all `generateObject`/`generateText` calls.
    *   Refine error handling within the `executePlan` loop (retry logic, fallback strategies, marking steps as failed).

7.  **Context Management:**
    *   Improve context passing to worker agents. Instead of `JSON.stringify(context)`, implement summarization or selective history retrieval to manage token limits.

8.  **Testing:**
    *   **Unit Tests**:
        *   `AgentOrchestrator`: Mock `generateObject`, test planning, execution logic, re-planning, result compilation.
        *   `ChatSetupService`: Verify orchestration decision logic and correct return types.
    *   **Integration Tests**: Test interaction between `ChatSetupService` and `AgentOrchestrator`.
    *   **API Route Tests**: Update `/api/chat` tests for both streaming and new JSON (orchestrated) responses.
    *   **Manual/E2E Testing**: Test diverse user queries designed to trigger (and not trigger) orchestration flows, including those requiring validation or research steps.

**Key Considerations & Adherence to Rules:**

*   **New Agents:** Explicitly adds `validator` and `researcher` agents to the available pool for the orchestrator.
*   **Vercel AI SDK:** Utilizes `generateObject`, `openai` provider.
*   **Modularity:** Introduces `AgentOrchestrator` service, integrates with existing `ChatSetupService`.
*   **Single Responsibility:** Clear roles for orchestrator, workers, setup service.
*   **Logging:** Comprehensive logging using `edgeLogger` per `logging-rules.mdc`.
*   **Routing:** API route adapts response type based on outcome, follows `routing-rules.mdc`.
*   **ESM:** Assumes ESM syntax.
*   **Existing Structure:** Builds upon current chat engine components.