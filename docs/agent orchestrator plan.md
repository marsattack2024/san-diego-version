# Plan: Implement Sequential Processing for Complex, Streaming for Simple

**Goal:** Refactor the chat engine to handle both simple and complex user requests efficiently. Simple requests will use fast streaming responses, while complex requests will use synchronous, multi-step sequential processing on the server to ensure accuracy and structure, returning a final JSON response.

**Strategy: Sequential Processing for Complex, Streaming for Simple**
1.  **Lightweight Classification:** A fast, initial LLM call determines if a request is 'simple' (direct answer + optional tools via `maxSteps`) or 'complex' (requiring a predefined sequence of agent steps).
2.  **Simple Flow:** For simple requests, use `streamText` directly with the default agent configuration, leveraging `maxSteps` for tool usage (e.g., RAG). The response is a standard AI SDK stream.
3.  **Complex Flow:**
    *   Generate a quick, high-level plan (sequence of agent roles, e.g., `['google-ads', 'copyeditor']`).
    *   Execute the **entire sequence** of agent steps **synchronously on the server** using non-streaming `generateText` or `generateObject` calls. Pass the output of one step as input to the next.
    *   Persist the **final output** after all server-side steps complete.
    *   Trigger title generation asynchronously.
    *   Return a **standard JSON response** containing the final assistant message content (e.g., `{ role: 'assistant', content: '...' }`).

**Benefits:**
*   Fast streaming response for simple requests.
*   Ensures structured, multi-step execution for complex tasks (e.g., draft -> edit).
*   Avoids synchronous blocking before the response *starts* (but complex requests will wait for full completion).
*   Clear separation between streaming and non-streaming paths.
*   Aligns with Vercel AI SDK standard patterns ("Sequential Processing" for complex, "Multi-Step Tool Usage" for simple).

**Status:**
*   Backend API Route (`/api/chat/route.ts`) **needs refactoring** to implement the bifurcated (streaming/JSON) logic. (🔄 PENDING)
*   Frontend (`useChat` hook/component) **needs significant modification** to handle both streaming and non-streaming JSON responses. (🔄 PENDING CLIENT UPDATE)
*   Orchestrator (`orchestrator.service.ts`) **needs refactoring** to provide lightweight classification and plan generation, removing heavy synchronous execution. (🔄 PENDING)
*   Title Generation (`title-service.ts`, `title-utils.ts`, `/api/chat/update-title`) logic exists but needs correct triggering (from both `onFinish` for simple flow and after sync execution for complex flow). (📝 PENDING TRIGGER FIX)
*   Linter/TS config issues require manual investigation. (❗ ONGOING)

*Linter Note:* Persistent type errors related to `LOG_CATEGORIES.ORCHESTRATOR` and `AgentType` inference exist in `orchestrator.service.ts`. These likely require **manual investigation** of the project's TS/build configuration or restarting the TS server. Vitest type errors also require manual `tsconfig.json` review.

**Phase 1: Refactor Orchestrator & Core Types (Backend)**

*   **Goal:** Update the orchestrator service to perform lightweight classification and planning, removing synchronous execution.
*   **Steps:**
    1.  **(Types)** Modify `lib/chat-engine/types/orchestrator.ts`:
        *   Define a new type/interface for the classification result, e.g., `ClassificationResult { isSimple: boolean; suggestedAgent: AgentType; reasoning?: string; }`.
        *   Define a type for the plan result, e.g., `PlanResult = AgentType[]`.
        *   Remove or comment out types related to the old `prepareContext` and `OrchestrationContext`.
    2.  **(Orchestrator)** Refactor `lib/chat-engine/services/orchestrator.service.ts`:
        *   Implement the `classifyRequest(request: string): Promise<ClassificationResult>` function using `generateObject` with a fast model (e.g., `gpt-4o-mini`), appropriate system prompt, and the new `ClassificationResult` schema. Log appropriately. Ensure **no tools** are passed or executed here.
        *   Implement the `generatePlan(request: string, complexAgent: AgentType): Promise<PlanResult>` function using `generateObject` to output *only* the sequence of agent roles based on the nature of the complex task (e.g., `['google-ads', 'copyeditor']`). Log appropriately. Ensure **no tools** are passed or executed here.
        *   Deprecate/remove the `prepareContext`, `executePlanAndGatherContext`, `run`, and `compileResults` methods. Keep constructor and logger initialization.
    3.  **(Agent Router)** Review `lib/chat-engine/agent-router.ts`: Ensure `getAgentConfig` and `createAgentToolSet` correctly provide configurations and toolsets for all necessary agents ('default', 'google-ads', 'copyeditor', etc.).
    4.  **(Testing - Initial):** Add/update unit tests for the new `classifyRequest` and `generatePlan` methods in `orchestrator.service.test.ts`. (Note: Still blocked by potential TS/Vitest config issues).

**Phase 2: Refactor API Route & Title Trigger (Backend)**

*   **Goal:** Implement the bifurcated API route logic for simple (streaming) and complex (synchronous JSON) responses.
*   **Steps:**
    1.  **(API Route)** Modify `app/api/chat/route.ts`:
        *   Remove the call to the old `orchestrator.prepareContext`.
        *   After auth/validation/history loading, call `orchestrator.classifyRequest(userMessage.content)`.
        *   Implement the `if (classification.isSimple)` block:
            *   Get config/tools for `'default'`.
            *   Call `streamText` with default config, messages, tools, and `maxSteps: 5`.
            *   Implement the `onFinish` callback:
                *   Call `persistenceService.saveAssistantMessage(...)` with the final `text`.
                *   Call `triggerTitleGenerationViaApi(...)`.
                *   Add logging and basic error handling.
            *   Return `result.toDataStreamResponse()`.
        *   Implement the `else` block (for `!classification.isSimple` - **Synchronous Execution**):
            *   Call `orchestrator.generatePlan(...)`.
            *   Initialize `intermediateResult` (likely with user message or relevant context).
            *   `try...catch` block for the sequence:
                *   Loop through the `plan` (e.g., `['google-ads', 'copyeditor']`).
                *   Inside the loop:
                    *   Get config for the current step's agent.
                    *   Call **`generateText` (non-streaming)** using the current agent's config/prompt and the `intermediateResult` from the previous step.
                    *   Update `intermediateResult` with the output of this step.
                    *   Add specific logging for each step completion.
                *   Let `finalResult = intermediateResult`.
            *   After the loop (or in `finally` if using try/finally for cleanup):
                *   Call `persistenceService.saveAssistantMessage(...)` with `finalResult`.
                *   Call `triggerTitleGenerationViaApi(...)`.
                *   Add comprehensive logging for the full sequence completion or errors.
            *   If successful, return **`Response.json({ role: 'assistant', content: finalResult }, { status: 200 })`**.
            *   If sequence errored, return an appropriate error `Response.json(...)`.
        *   Add top-level error handling for the API route.

**Phase 3: Frontend Handling & Testing (Client/Full Stack)**

*   **Goal:** Implement client-side logic to handle both streaming and standard JSON responses, ensure robustness, and conduct thorough testing.
*   **Steps:**
    1.  **(Frontend Chat Component / Hook):** Modify the form submission logic:
        *   **Determine Response Type:** Decide how the client knows whether to expect a stream or JSON. Options:
            *   a) Make an initial lightweight API call to `classifyRequest` first.
            *   b) Send the main request and check the `Content-Type` header of the response (`text/event-stream` vs `application/json`). (More common).
        *   **If Streaming Expected:** Use `useChat`'s `handleSubmit` or `append` as normal.
        *   **If JSON Expected:**
            *   Manually call `fetch` to `app/api/chat/route.ts`.
            *   Display a loading indicator.
            *   On successful JSON response:
                *   Use `setMessages` (from `useChat`) to add the user's message and the received assistant message (`{ role: 'assistant', content: responseData.content }`) to the chat display.
            *   Handle fetch errors, display error messages in the UI.
    2.  **(Logging & Observability)** Review and enhance logging across all modified files, focusing on clarity, performance tracking (durationMs for complex sequences), error details, adhering to `logging-rules.mdc`.
    3.  **(Error Handling)** Add specific `try...catch` blocks around critical sections: classification, planning, each `generateText` call in the synchronous loop, persistence calls, and title trigger calls. Ensure errors are communicated to the client appropriately via the JSON response for the complex path.
    4.  **(Testing - Comprehensive):**
        *   Resolve TS/Vitest configuration issues (Manual Step).
        *   Run/update unit tests for the orchestrator.
        *   Add integration tests for `app/api/chat/route.ts`:
            *   Test simple streaming path (with/without tool use).
            *   Test complex non-streaming JSON path (e.g., 2-step plan). Verify sequential execution, final persisted output, title trigger, and correct JSON response.
            *   Test various error conditions for both paths.
        *   Perform manual E2E testing using the UI for both simple and complex prompts, verifying the streaming behavior for simple and the loader + final message display for complex flows.

**Key Considerations & Adherence to Rules:**

*   **Agents:** Uses specific agent configs (`google-ads`, `copyeditor`, etc.) executed sequentially via `generateText` for complex tasks.
*   **Strategy:** Implements "Sequential Processing for Complex, Streaming for Simple".
*   **Vercel AI SDK:** Utilizes `generateObject` for classification/planning; `streamText` for simple flow; `generateText` for complex flow steps. Requires frontend changes to handle non-streaming responses.
*   **Modularity:** Orchestrator handles classification/planning; API route handles request lifecycle, streaming/synchronous execution; Persistence service handles DB.
*   **Logging:** Requires updates for new flow, tracking duration of complex sequences.
*   **Routing:** Logic handled within `/api/chat`.
*   **ESM:** Assumes ESM syntax.