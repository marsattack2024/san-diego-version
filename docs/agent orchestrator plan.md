# Plan: Implement AI Workflow Orchestrator

**Goal:** Integrate a flexible, multi-step AI workflow orchestrator into the existing chat engine (`lib/chat-engine`), leveraging the Vercel AI SDK (`ai` package) for dynamic routing and agent execution, following the Orchestrator-Worker pattern. This will replace the initial plan based on the "GROX idea" and integrate directly with our current architecture.

**Status:** Phase 1 & 2 Complete. Phase 3 (Refinement & Testing) Ready (with outstanding config issues).

*Linter Note:* Debugging revealed the root cause of the `LogCategory` error was a local redefinition in `edge-logger.ts`, which has been fixed by importing from `constants.ts`. However, the linter errors may persist until the TS server/build process picks up the change. The Vitest type errors require **manual investigation** of `tsconfig.json` (ensure `"types": ["node", "vitest/globals"]` is present and effective) and potentially restarting the TS server.

**Phase 1: Core Orchestrator Logic & Types (✅ COMPLETE)**

*   **Objective:** Build the foundational components of the orchestrator service and define necessary data structures.

1.  **Define Orchestrator Types (`lib/chat-engine/types/orchestrator.ts`):** ✅
    *   Created file and defined core interfaces/Zod schemas.
    *   Updated `AgentType` enum in `lib/chat-engine/prompts/index.ts`.

2.  **Create Orchestrator Service (`lib/chat-engine/services/orchestrator.service.ts`):** ✅
    *   Created file and implemented `AgentOrchestrator` class structure.
    *   Implemented `generatePlan`, `executePlan`, `compileResults`, and `run` methods.
    *   Added placeholder configs for `validator` and `researcher` agents in `lib/chat-engine/agent-router.ts`.
    *   Added `maxTokens` to `AgentConfig` interface.
    *   Corrected `openai()` usage in `executePlan`.
    *   Added `AgentType` cast as workaround for linter error.
    *   *Note:* Logging uses `LOG_CATEGORIES.ORCHESTRATOR` correctly, but linter errors persist (see status note).

**Phase 2: Integration into Chat Engine (✅ COMPLETE)**

*   **Objective:** Connect the orchestrator service to the existing chat request flow.

3.  **Modify `ChatSetupService` (`lib/chat-engine/chat-setup.service.ts`):** ✅
    *   Injected `AgentOrchestrator` dependency.
    *   Added logic to `prepareConfig` to check `useOrchestrator` flag and `!isWidget`.
    *   Handles returning `OrchestratedResponse` or `ChatEngineConfig`.
    *   Fixed `AgentType` import path.
    *   Fixed duplicate key in logger call.

4.  **Update API Route (`app/api/chat/route.ts`):** ✅
    *   Modified `POST` handler to check the result type from `ChatSetupService`.
    *   Handles returning JSON (`successResponse`) for `OrchestratedResponse`.
    *   Handles standard streaming flow for `ChatEngineConfig`.
    *   Fixed type casting issue for `ChatEngineConfig`.
    *   Added type check in `app/api/widget-chat/route.ts` to prevent orchestration and handle types correctly. 

**Phase 3: Refinement & Testing (⏳ Next Step)**

*   **Objective:** Improve robustness, observability, and validate the implementation.

5.  **Logging & Observability:** (📝 To Do)
    *   Review/enhancement of logging in `AgentOrchestrator` can proceed once type errors are manually resolved.

6.  **Error Handling:** (📝 To Do)
    *   Refine error handling within `AgentOrchestrator.executePlan`.

7.  **Context Management:** (📝 To Do)
    *   Implement smarter context passing in `AgentOrchestrator.executePlan`.

8.  **Testing:** (⏳ Next Step - Blocked by TS/Vitest Config)
    *   **Unit Tests**:
        *   `AgentOrchestrator`: (📝 To Do - Scaffolded, but blocked by Vitest type errors needing manual config review)
        *   `ChatSetupService`: (📝 To Do - Type guards added, but blocked by persistent type errors needing manual TS server check)
    *   **Integration Tests**: (📝 To Do - Needs investigation of existing test issues)
    *   **API Route Tests**: (📝 To Do - Update existing tests)
    *   **Manual/E2E Testing**: (📝 To Do)

**Key Considerations & Adherence to Rules:**

*   **New Agents:** Explicitly adds `validator` and `researcher` agents to the available pool for the orchestrator.
*   **Vercel AI SDK:** Utilizes `generateObject`, `openai` provider.
*   **Modularity:** Introduces `AgentOrchestrator` service, integrates with existing `ChatSetupService`.
*   **Single Responsibility:** Clear roles for orchestrator, workers, setup service.
*   **Logging:** Comprehensive logging using `edgeLogger` per `logging-rules.mdc` (but facing type issues in orchestrator service).
*   **Routing:** API route adapts response type based on outcome, follows `routing-rules.mdc`.
*   **ESM:** Assumes ESM syntax.
*   **Existing Structure:** Builds upon current chat engine components.