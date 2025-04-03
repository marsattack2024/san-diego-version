# Plan: Implement AI Workflow Orchestrator (Aligned with AI SDK Streaming)

**Goal:** Integrate a flexible, multi-step AI workflow orchestrator into the existing chat engine (`lib/chat-engine`). The orchestrator will prepare context (e.g., refined prompts, specific model choices, gathered data) based on complex workflows. The main API route (`/api/chat`) will consume this context and use standard Vercel AI SDK functions (`streamText`) to generate the final streaming response, compatible with the frontend `useChat` hook.

**Strategy:** Consolidate complex workflow decision-making and execution (excluding final response generation) into the orchestrator's `prepareContext` method. `ChatSetupService` invokes the orchestrator for non-widget requests. The API route (`/api/chat`) receives the context, calls `streamText` with it, and handles persistence via `MessagePersistenceService` in the `onFinish` callback.

**Status:**
*   Backend API Route (`/api/chat/route.ts`) refactored to use `streamText` and `onFinish` persistence pattern. (✅ COMPLETE)
*   Frontend (`useChat`) remains standard. (✅ NO CHANGE NEEDED)
*   Orchestrator (`orchestrator.service.ts`) modification to implement `prepareContext` and adjust internal logic. (📝 PENDING)
*   Definition of `OrchestrationContext` type. (📝 PENDING)
*   Linter/TS config issues require manual investigation. (❗ ONGOING)

*Linter Note:* Persistent type errors related to `LOG_CATEGORIES.ORCHESTRATOR` and `AgentType` inference exist in `orchestrator.service.ts`. These likely require **manual investigation** of the project's TS/build configuration or restarting the TS server. Vitest type errors also require manual `tsconfig.json` review.

**Phase 1: Core Orchestrator Logic & Types (🔄 IN PROGRESS - Requires Modification)**

*   **Objective:** Refactor the orchestrator to prepare context for the streaming API route, rather than generating the final response itself.

1.  **Define Orchestrator Types (`lib/chat-engine/types/orchestrator.ts`):** (📝 PENDING)
    *   Define the `OrchestrationContext` interface (e.g., with `targetModelId`, `finalSystemPrompt`, `contextMessages`).
    *   Update existing types (`WorkflowPlan`, `AgentOutput`) as needed to support context preparation.
    *   Keep `AgentType` updates (Removed `validator`, added `copyeditor`). (✅ DONE)

2.  **Refactor Orchestrator Service (`lib/chat-engine/services/orchestrator.service.ts`):** (📝 PENDING)
    *   Implement the new `prepareContext` method. This method will likely call `generatePlan` and a modified `executePlan`.
    *   Modify `executePlan` to run steps necessary for context gathering (e.g., research) and format results into `contextMessages`. It should determine `targetModelId` and potentially `finalSystemPrompt`. It should *not* generate the final user-facing text.
    *   Deprecate or adapt the `run` method and `compileResults`.
    *   Ensure logging reflects the new flow and context preparation goal. Performance flags (`slow`, `important`) based on `THRESHOLDS` should be applied. (✅ LOGGING FLAGS ADDED, needs review in new flow).
    *   Keep agent configuration updates (Removed `validator`, added `copyeditor`). (✅ DONE)

**Phase 2: Integration into Chat Engine & API (✅ COMPLETE - Refactored)**

*   **Objective:** Ensure the chat request flow uses the standard AI SDK streaming pattern, with the orchestrator providing context.

3.  **Modify `ChatSetupService` (`lib/chat-engine/chat-setup.service.ts`):** (✅ DONE - No recent changes needed, but its *role* slightly changes)
    *   Continues to call the orchestrator (now `prepareContext`) for non-widget requests. It no longer expects an `OrchestratedResponse` object from the orchestrator itself for the main chat path. (Note: The service itself doesn't need code changes, but its interaction pattern with the API route and orchestrator is now different).

4.  **Update API Route (`app/api/chat/route.ts`):** (✅ COMPLETE - Refactored)
    *   Handles POST requests from `useChat`.
    *   Calls `orchestrator.prepareContext` (or equivalent) to get context.
    *   Uses `streamText` with the context (history, user message, orchestrator context messages, target model, system prompt) to generate the final streaming response.
    *   Uses `result.toDataStreamResponse()` to return the stream.
    *   Handles persistence in the `onFinish` callback using `MessagePersistenceService`.

**Phase 3: Refinement & Testing (📝 Next Steps - Post Orchestrator Refactor)**

*   **Objective:** Ensure robustness, observability, and validate the new implementation.

5.  **Logging & Observability:** (📝 To Do)
    *   Manually verify `LOG_CATEGORIES.ORCHESTRATOR` type resolution after config check/TS restart.
    *   Review implemented logging in `AgentOrchestrator`'s new `prepareContext` flow against `logging-rules.mdc`.
    *   Verify logging in `/api/chat/route.ts`, especially within `onFinish`.

6.  **Error Handling:** (📝 To Do)
    *   Review error handling in `prepareContext` (e.g., failures during planning or step execution).
    *   Review error handling in `/api/chat/route.ts` for `streamText` and `onFinish` persistence failures.

7.  **Context Management:** (📝 To Do)
    *   Refine how `contextMessages` are generated by the orchestrator and passed to `streamText`. Ensure proper formatting and relevance. Avoid excessive context length.

8.  **Testing:** (📝 To Do - Blocked by TS/Vitest Config)
    *   Manually resolve Vitest type configuration issues in `tsconfig.json` / TS Server.
    *   Implement/update unit tests for `AgentOrchestrator.prepareContext`.
    *   Implement/update integration tests for the `/api/chat` route, verifying streaming and persistence.
    *   Perform thorough Manual/E2E testing for both simple (single-step equivalent) and complex (orchestrated context) flows.

**Key Considerations & Adherence to Rules:**

*   **Agents:** Uses `researcher`, `copyeditor`, and primary generation agents (`quiz`, `google-ads`, etc.) potentially within `prepareContext`. `validator` removed.
*   **Strategy:** Implements "Orchestrator Prepares Context" for standard streaming.
*   **Vercel AI SDK:** Utilizes `generateObject` within orchestrator; `streamText` and `toDataStreamResponse` within the API route; `useChat` on the frontend. Adheres to standard patterns.
*   **Modularity:** `AgentOrchestrator` handles complex workflow logic; `MessagePersistenceService` handles DB operations; API route handles request lifecycle and final streaming.
*   **Logging:** Enhanced logging implemented (pending linter error resolution and flow adjustments).
*   **Routing:** Main chat route (`/api/chat`) now returns a standard AI SDK stream; widget route (`/api/widget-chat`) remains unchanged (uses `ChatEngine` facade for streaming).
*   **ESM:** Assumes ESM syntax.
*   **Existing Structure:** Built upon current chat engine components, refactoring integration points.