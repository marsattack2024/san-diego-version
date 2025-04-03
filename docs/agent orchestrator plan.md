# Plan: Implement AI Workflow Orchestrator

**Goal:** Integrate a flexible, multi-step AI workflow orchestrator into the existing chat engine (`lib/chat-engine`), leveraging the Vercel AI SDK (`ai` package) for dynamic routing and agent execution, following the Orchestrator-Worker pattern. **Strategy:** Consolidate workflow decision-making into the orchestrator's planning phase. `ChatSetupService` always invokes the orchestrator for non-widget requests, and the orchestrator's `generatePlan` method determines whether a single-step (default agent) or multi-step plan (e.g., `researcher` -> `primary_agent` -> `copyeditor`) is needed.

**Status:** Code Implementation Complete for Revised Strategy. Pending Manual Review & Config Fixes.

*Linter Note:* Persistent type errors related to `LOG_CATEGORIES.ORCHESTRATOR` and `AgentType` inference exist in `orchestrator.service.ts`. These likely require **manual investigation** of the project's TS/build configuration or restarting the TS server. Vitest type errors also require manual `tsconfig.json` review.

**Phase 1: Core Orchestrator Logic & Types (✅ COMPLETE - Code Provided)**

*   **Objective:** Build the foundational components of the orchestrator service and define necessary data structures.

1.  **Define Orchestrator Types (`lib/chat-engine/types/orchestrator.ts`):** ✅
    *   Defined core interfaces/Zod schemas.
    *   Updated `AgentType` enum/array in `lib/chat-engine/prompts/index.ts` (Removed `validator`, added `copyeditor`).

2.  **Create Orchestrator Service (`lib/chat-engine/services/orchestrator.service.ts`):** ✅
    *   Implemented `AgentOrchestrator` class.
    *   **Revised `generatePlan`:** Includes complexity assessment logic and updated prompt considering `copyeditor`/`researcher`.
    *   **Revised `executePlan` & `compileResults`:** Implemented core logic, including enhanced logging with performance flags (`slow`, `important`) based on `THRESHOLDS`.
    *   Updated agent configurations in `lib/chat-engine/agent-router.ts` (Removed `validator`, added `copyeditor`).
    *   *Note:* Complete code provided manually due to edit tool issues. Requires manual file replacement. Linter errors persist pending config investigation.

**Phase 2: Integration into Chat Engine (✅ COMPLETE)**

*   **Objective:** Simplify the chat request flow to always use the orchestrator for main chat.

3.  **Modify `ChatSetupService` (`lib/chat-engine/chat-setup.service.ts`):** ✅
    *   Simplified `prepareConfig` to always call orchestrator for non-widget requests.

4.  **Update API Route (`app/api/chat/route.ts`):** ✅
    *   Simplified `POST` handler to always expect `OrchestratedResponse` and return JSON for this route.

**Phase 3: Refinement & Testing (📝 Next Steps - Post Manual Review)**

*   **Objective:** Ensure robustness, observability, and validate the new implementation.

5.  **Logging & Observability:** (📝 To Do)
    *   Manually verify `LOG_CATEGORIES.ORCHESTRATOR` type resolution after config check/TS restart.
    *   Review implemented logging in `AgentOrchestrator` against `logging-rules.mdc`.

6.  **Error Handling:** (📝 To Do)
    *   Review and potentially enhance error handling strategies within `AgentOrchestrator.executePlan` (e.g., handling worker failures, re-planning failures).

7.  **Context Management:** (📝 To Do)
    *   Implement smarter context passing in `AgentOrchestrator.executePlan` (e.g., summarization) to replace simple `JSON.stringify`.

8.  **Testing:** (📝 To Do - Blocked by TS/Vitest Config)
    *   Manually resolve Vitest type configuration issues in `tsconfig.json` / TS Server.
    *   Implement unit tests outlined in `orchestrator.service.test.ts`.
    *   Implement/update integration and API route tests.
    *   Perform thorough Manual/E2E testing for both simple (single-step) and complex (multi-step) flows.

**Key Considerations & Adherence to Rules:**

*   **Agents:** Uses `researcher`, `copyeditor`, and primary generation agents (`quiz`, `google-ads`, etc.). `validator` removed.
*   **Strategy:** Implements the "Single Smart Planner" approach.
*   **Vercel AI SDK:** Utilizes `generateObject`, `openai` provider.
*   **Modularity:** `AgentOrchestrator` service handles core workflow logic.
*   **Logging:** Enhanced logging implemented in `AgentOrchestrator` code (pending linter error resolution).
*   **Routing:** Main chat route (`/api/chat`) expects JSON from orchestrator; widget route (`/api/widget-chat`) remains unchanged (single-agent streaming).
*   **ESM:** Assumes ESM syntax.
*   **Existing Structure:** Built upon current chat engine components.