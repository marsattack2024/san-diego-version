# Plan: Implement AI Workflow Orchestrator

**Goal:** Integrate a flexible, multi-step AI workflow orchestrator into the existing chat engine (`lib/chat-engine`), leveraging the Vercel AI SDK (`ai` package) for dynamic routing and agent execution, following the Orchestrator-Worker pattern. **Strategy Change:** Consolidate workflow decision-making into the orchestrator's planning phase. `ChatSetupService` will always invoke the orchestrator for non-widget requests, and the orchestrator's `generatePlan` method will determine whether a single-step (default agent) or multi-step plan is needed.

**Status:** Revising Phase 1 & 2 Implementation based on new strategy. Phase 3 Ready pending implementation & resolution of config issues.

*Linter Note:* Persistent type errors... require manual investigation...

**Phase 1: Core Orchestrator Logic & Types (✅ COMPLETE - Requires Revision)**

*   **Objective:** Build the foundational components of the orchestrator service and define necessary data structures.

1.  **Define Orchestrator Types (`lib/chat-engine/types/orchestrator.ts`):** ✅
    *   Updated `AgentType` enum/array in `lib/chat-engine/prompts/index.ts` (Removed `validator`, added `copyeditor`).

2.  **Create Orchestrator Service (`lib/chat-engine/services/orchestrator.service.ts`):** (✅ **REVISED & PROVIDED**)
    *   Updated `generatePlan` method:
        *   Updated system prompt to include `copyeditor`, exclude `validator`, and guide complexity assessment (single vs. multi-step).
    *   `executePlan` / `compileResults` / `run` methods updated to handle flow.
    *   Updated agent configurations in `lib/chat-engine/agent-router.ts` (Removed `validator`, added `copyeditor`).
    *   *Note:* Requires manual replacement of file content with provided code. Linter errors may persist pending manual config review.

**Phase 2: Integration into Chat Engine (✅ COMPLETE - Requires Revision Check)**

*   **Objective:** Simplify the chat request flow to always use the orchestrator for main chat.

3.  **Modify `ChatSetupService` (`lib/chat-engine/chat-setup.service.ts`):** (✅ **REVISED**)
    *   Simplified `prepareConfig` method to always call orchestrator for non-widget requests.

4.  **Update API Route (`app/api/chat/route.ts`):** (✅ **REVISED**)
    *   Simplified `POST` handler to always expect `OrchestratedResponse` and return JSON.

**Phase 3: Refinement & Testing (📝 To Do)**

*   **Objective:** Improve robustness, observability, and validate the new implementation.

5.  **Logging & Observability:** (📝 To Do)
    *   Review logging in the revised orchestrator code.

6.  **Error Handling:** (📝 To Do)
    *   Refine error handling within `AgentOrchestrator.executePlan`.

7.  **Context Management:** (📝 To Do)
    *   Implement smarter context passing in `AgentOrchestrator.executePlan`.

8.  **Testing:** (📝 To Do - Blocked by TS/Vitest Config)
    *   **Unit Tests**: Update/rewrite tests for `AgentOrchestrator` and `ChatSetupService`.
    *   **API Route Tests**: Update tests for `/api/chat`.
    *   **Manual/E2E Testing**: Test simple and complex queries (e.g., involving `researcher` -> `google-ads` -> `copyeditor`).

**Key Considerations & Adherence to Rules:**

*   **New Agents:** Explicitly adds `validator` and `researcher` agents to the available pool for the orchestrator.
*   **Vercel AI SDK:** Utilizes `generateObject`, `openai` provider.
*   **Modularity:** Introduces `AgentOrchestrator` service, integrates with existing `ChatSetupService`.
*   **Single Responsibility:** Clear roles for orchestrator, workers, setup service.
*   **Logging:** Comprehensive logging using `edgeLogger` per `logging-rules.mdc` (but facing type issues in orchestrator service).
*   **Routing:** API route adapts response type based on outcome, follows `routing-rules.mdc`.
*   **ESM:** Assumes ESM syntax.
*   **Existing Structure:** Builds upon current chat engine components.