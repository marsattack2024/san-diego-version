# Chat Engine Refactoring Plan (Agent Routing & Tool Configuration)

**Goal:** Refactor the chat API endpoints to correctly handle dynamic agent selection, tool configuration (including DeepSearch, WebScraper, RAG), and request flags while adhering to the Single Responsibility Principle (SRP) and Vercel AI SDK best practices. Consolidate primary chat logic into a single, robust `/api/chat/route.ts` and prepare the architecture for future multi-agent patterns.

**Status:** Automated Testing Complete (Unit Tests Passing, Integration Tests Blocked). Ready for Manual Verification.

## Current State Analysis (Pre-Refactor)

This section documents how the system currently operates, focusing on validation, authentication, tool handling, and relevant UI interactions to ensure these aspects remain functional after the refactor.

### Endpoints & Their Current Roles:

1.  **`/api/chat/route.ts`:**
    *   **Context:** Main application chat (`/chat` page).
    *   **Functionality:** Currently **oversimplified**. Intended for the main application chat but fails to handle dynamic features.
    *   **Agent/Tools:** Does **not** perform agent detection or dynamic tool loading. Calls `createChatEngine` with a minimal, static configuration (`operationName: 'chat_default'`, `requiresAuth: true`). Tools are **not** passed to the engine, causing features like DeepSearch, WebScraper, and RAG requested via UI flags to **fail**.
    *   **Validation:** Parses JSON body. Basic implicit validation happens via engine internals, but lacks route-level validation of flags or specific message structures.
    *   **Authentication:** Delegates to `ChatEngineFacade`, requires authentication.

2.  **`/api/agent-chat/route.ts`:**
    *   **Context:** Likely an older or parallel implementation attempt for main chat. (**DEPRECATED & DELETED**).
    *   **Functionality:** Contained the complex logic for agent routing and tool setup.
    *   **Agent/Tools:** Performed agent detection (`detectAgentType`), created an agent-specific toolset (`createAgentToolSet`), and passed the correct configuration to `createChatEngine`.
    *   **Validation:** Parsed JSON body, checked for message/session ID.
    *   **Authentication:** Delegated to `ChatEngineFacade`, required authentication.

3.  **`/api/widget-chat/route.ts`:**
    *   **Context:** Embeddable chat widget (`ChatWidgetV2`).
    *   **Functionality:** Handles widget requests with a fixed, simpler configuration.
    *   **Agent/Tools:** Uses a **fixed** setup: `gpt-4o-mini` model, `widget` prompt, `widgetTools` (likely RAG only), explicitly disables DeepSearch/WebScraper. Does **not** perform agent detection.
    *   **Validation:** Uses a Zod schema (`widgetRequestSchema`) for robust request body validation.
    *   **Authentication:** Explicitly **disabled** (`requiresAuth: false`, passes `bypassAuth: true`).
    *   **CORS:** Enabled and handled.
    *   **Persistence:** Server-side persistence explicitly **disabled**.

### Relevant UI Components & Interaction Flow:

1.  **`components/chat.tsx` (Main Chat UI):**
    *   Uses `useChat` hook (from `@ai-sdk/react`) targeting `/api/chat` (**VERIFIED - Step 7**).
    *   Reads `selectedAgentId` and `deepSearchEnabled` state from `useChatStore` (Zustand).
    *   Passes these flags (`agentId`, `deepSearchEnabled`) in the `body` option of the `useChat` hook call. This is the **source** of dynamic configuration requests.
    *   Renders `VirtualizedChat` and `MultimodalInput`.

2.  **`components/multimodal-input.tsx` (Input Bar):**
    *   Contains `AgentSelector` (likely updates `selectedAgentId` in Zustand store).
    *   Contains `DeepSearchButton` (toggles `deepSearchEnabled` in Zustand store).
    *   Handles text input and form submission (`handleSubmit` from `useChat`).

3.  **`components/virtualized-chat.tsx` (Message List):**
    *   Displays messages efficiently using `react-virtuoso`.
    *   Handles lazy loading of older messages via API calls.
    *   Displays thinking/searching indicators based on `isLoading` and `deepSearchEnabled` state.

4.  **`components/chat-widget/**` (Widget UI & Logic):**
    *   Uses `use-app-chat.ts` which wraps `useChat`.
    *   Targets `/api/widget-chat` API endpoint.
    *   Manages its own session state via local storage.

### Core Backend Components & Logic Flow (Current):

1.  **Request Parsing:** Routes parse body via `req.json()`. `/api/widget-chat` adds Zod validation.
2.  **Authentication (`ApiAuthService` via Facade):** Standard Supabase SSR cookie auth (`createRouteHandlerClient`). Supports bypass.
3.  **Agent Detection (`detectAgentType`):** Uses `generateObject` for LLM-based classification. Called by `/api/agent-chat`.
4.  **Tool Set Creation (`createToolSet`/`createAgentToolSet`):** Conditionally includes tools based on boolean flags. Called by `/api/agent-chat`. Widget uses fixed `widgetTools`.
5.  **Engine Creation (`createChatEngine` Factory):** Initializes services and `ChatEngineFacade` instance, accepting a `ChatEngineConfig`.
6.  **Engine Execution (`ChatEngineFacade.handleRequest`):** Orchestrates context building, AI SDK calls (`AIStreamService`), persistence (`MessagePersistenceService`), and callbacks. Relies heavily on the passed `ChatEngineConfig` for tools, prompts, model, flags.
7.  **Flag Propagation (`deepSearchEnabled` example):**
    *   **Broken (`/api/chat`):** UI sends flag -> Route ignores -> Engine gets default config (no tools, flag false) -> Tools fail.
    *   **Working (`/api/agent-chat`):** UI sends flag -> Route parses flag, detects agent, creates tools -> Engine gets correct config (tools included, flag true in `config.body`) -> Tools work.
    *   **Widget (`/api/widget-chat`):** Route hardcodes config (tools excluded, flag false).

### Summary of Current Problem & Validation/Auth Notes:

The primary issue is that the main `/api/chat/route.ts` endpoint lacked the necessary logic (agent detection, tool creation, flag parsing) found in `/api/agent-chat/route.ts` and the original diff. This prevented dynamic tool usage (DeepSearch, WebScraper, RAG) for the main application chat.

*   **Validation:** Standardized in Step 2. `/api/widget-chat` uses Zod. `/api/chat` uses basic checks; Zod recommended for future enhancement.
*   **Authentication:** Preserved in Step 2. Standard Supabase SSR cookie auth via `createRouteHandlerClient`. Auth Bypass logic for dev needs to be added back if required.

## Proposed Refactoring Plan

**Goal:** Consolidate logic into `/api/chat/route.ts`, making it robust and capable of handling different contexts (main vs. widget) and configurations, while adhering to SRP and preparing for future multi-agent patterns.

**Core Idea:** Introduce a `ChatSetupService` to encapsulate the complex configuration logic, keeping the route handler clean.

**Steps:**

1.  **(DONE) Create `ChatSetupService` (`lib/chat-engine/chat-setup.service.ts`):**
    *   **Responsibility:** Determine the full `ChatEngineConfig` based on request parameters and context. Serve as the central point for configuration logic.
    *   **Interface:**
        ```typescript
        interface ChatSetupInput {
          requestBody: Record<string, any>; // Parsed request body
          userId?: string; // Authenticated user ID
          isWidget: boolean; // Flag to distinguish context
        }

        interface ChatSetupService {
          prepareConfig(input: ChatSetupInput): Promise<ChatEngineConfig>;
        }
        ```
    *   **Implementation:**
        *   **Input Processing:** Extract flags (`deepSearchEnabled`, `requestedAgentId`, etc.) using `parseBooleanValue`. Get `lastUserMessageContent`.
        *   **Context Handling:** Use `isWidget` flag.
        *   **Agent Routing (if !isWidget):** Call `detectAgentType(lastUserMessageContent, requestedAgentId)`. Get `agentConfig`. *This aligns with the AI SDK Agent Routing pattern.*
        *   **Tool Configuration:** Determine tool usage flags (`shouldUseDeepSearch`, etc.) based on `agentConfig.toolOptions` (main chat) or fixed settings (widget). Call `createToolSet` (**Verified correct registry used**: `createToolSet` for main, `widgetTools` for widget).
        *   **Prompt Generation:** Call `prompts.buildSystemPrompt(agentType, shouldUseDeepSearch)`.
        *   **Auth/Persistence Flags:** Set `requiresAuth`, `messagePersistenceDisabled` based on `isWidget`.
        *   **Assemble `ChatEngineConfig`:** Construct final config including `tools`, `systemPrompt`, `model`, `temperature`, auth/persistence flags, `agentType`, `useDeepSearch: shouldUseDeepSearch`. **Critically, populate `config.body` with ALL flags needed by ANY tool:** `{ deepSearchEnabled: shouldUseDeepSearch, sessionId, userId, agentType, isWidgetChat: isWidget, /* other potential flags */ }`. (**Verified & Confirmed**).
        *   **Logging:** Add detailed logging (`edgeLogger.debug`/`info`) for each step (flag parsing, agent detection, tool selection). Follow `logging-rules.mdc`.
    *   **Future Multi-Agent Enhancement:** This service is the ideal place to later incorporate more complex agent patterns (Sequential Processing, Orchestrator-Worker). Instead of just returning one `ChatEngineConfig`, it could potentially return a sequence of configurations or manage a multi-step workflow based on the initial `detectAgentType` result or further analysis.

2.  **(DONE) Refactor `/api/chat/route.ts`:**
    *   **Responsibility:** HTTP handling, Auth, Basic Validation, Orchestration.
    *   **Implementation:**
        *   Adhere to `routing-rules.mdc`: Use standard `Request`/`Response`, `export const runtime = 'edge'`, utility functions (`errorResponse`, `unauthorizedError`, `validationError`), `createRouteHandlerClient`.
        *   Parse request body (`req.json()`).
        *   Authenticate user (**Auth Bypass logic conditionally added based on env vars**). Determine `persistenceUserId`.
        *   Basic Validation: Ensure `body.messages` or `body.message` exists, ensure `body.id` (sessionId) exists. (**Zod validation recommended for future enhancement**).
        *   Instantiate/import `chatSetupService`.
        *   Call `const engineConfig = await chatSetupService.prepareConfig({ requestBody: body, userId: persistenceUserId, isWidget: false });`.
        *   Call `const engine = createChatEngine(engineConfig);`.
        *   Clone request (`reqClone`) before passing to `handleRequest`.
        *   Call `const response = await engine.handleRequest(reqClone, { parsedBody: body });` (Pass pre-parsed body).
        *   Handle stream consumption.
        *   Return response. Implement top-level try/catch using `errorResponse` for final error output. Log errors following `logging-rules.mdc`.

3.  **(DONE) Refactor `/api/widget-chat/route.ts`:**
    *   **Responsibility:** HTTP handling (CORS, GET ping), Widget Validation, Orchestration.
    *   **Implementation:**
        *   Keep existing OPTIONS/GET handlers and Zod validation (`widgetRequestSchema`).
        *   Inside `POST`, after successful Zod validation:
        *   Instantiate/import `chatSetupService`.
        *   Call `const engineConfig = await chatSetupService.prepareConfig({ requestBody: body, userId: undefined, isWidget: true });`.
        *   Call `const engine = createChatEngine(engineConfig);`.
        *   Clone request (`reqClone`).
        *   Call `const response = await engine.handleRequest(reqClone, { parsedBody: body, additionalContext: { isWidgetRequest: true } });`.
        *   Return response. Keep specific widget error formatting (returning 200 OK with error payload for UI). Adhere to `routing-rules.mdc` and `logging-rules.mdc` for internal logging/structure.

4.  **(DONE) Update `ChatEngineFacade` Constructor:**
    *   **Action:** Remove the internal logic blocks that check `this.config.body?.deepSearchEnabled` and the block that sets `this.config.body.deepSearchEnabled` based on `this.config.useDeepSearch`. The constructor should now fully trust the incoming `config` object.

5.  **(DONE) Review & Update Tool Implementations (e.g., `deep-search.tool.ts`):**
    *   **Action:** Remove the `FORCE_ENABLE_DEEPSEARCH` constant and related bypass logic.
    *   **Verification:** Ensure the tool's `execute` function correctly reads `deepSearchEnabled` (and any other needed flags) exclusively from the injected system message workaround.

6.  **(DONE) Deprecate `/api/agent-chat/route.ts`:**
    *   **Action:** Delete the file `/app/api/agent-chat/route.ts`.
    *   **Verification:** Search codebase for any imports or references and remove/update them (especially in tests).

7.  **(DONE) Update Frontend (`components/chat.tsx`):**
    *   **Action:** Ensure the `useChat` hook call is targeting the correct, unified API endpoint: `/api/chat`. Remove any explicit `api: '/api/agent-chat'` if present.

8.  **(BLOCKED / Partially Complete) Testing:**
    *   **Goal:** Ensure refactored endpoints function correctly, tools invoke properly, auth/validation work, and no regressions exist.
    *   **A. (DONE) Unit Tests for `ChatSetupService`:** Verified core config logic.
    *   **B. (FAILING - BLOCKED) Integration Tests for API Routes:** Route handler tests (`/api/chat`, `/api/widget-chat`) are currently failing due to environment issues (`cache()` function). **Require separate debugging effort using adjusted shallow mocking strategy or alternative approach.**
    *   **C. (DONE) Update Existing Unit Tests:** Reviewed relevant unit tests (`deep-search.test.ts`); confirmed alignment.
    *   **D. (TODO - Next) Manual Verification (Smoke Testing):** Needs to be performed by running the application.
        *   **Main Chat:** Test basic messages, agent selection, DeepSearch toggle (verify network/response), URL scraping (verify logs/response), RAG.
        *   **Widget:** Test basic messages, RAG, verify DeepSearch/WebScraper inactive.

9.  **(TODO) Documentation:**
    *   Update this plan document (`agent refactor plan.md`) marking steps as complete.
    *   Update any READMEs mentioning chat API endpoints.

**Verification Against Principles:**

*   **SRP:** Achieved.
*   **Vercel Alignment:** Pattern confirmed and ready for future agent patterns.
*   **Maintainability:** Improved.
*   **Consistency:** Unified configuration approach.
*   **Validation/Auth:** Existing mechanisms preserved and integrated.

## Post-Refactor Enhancement Plan

**Goal:** Implement a new tool to provide user profile context to the AI upon request.

**Status:** Step 2 Complete. Starting Step 3.

**Steps:**

1.  **(DONE) Create `profile-context.tool.ts` (`lib/tools/`):**
    *   Define tool `getUserProfileContext` using `import { tool } from 'ai';`.
    *   Add description guiding AI on *when* to use it (personalized advice/content).
    *   Define empty Zod parameters: `z.object({})`.
    *   Implement `execute` function:
        *   Extract `userId` from context (initially via system message workaround).
        *   If `userId` exists, query `sd_user_profiles` for relevant fields (`full_name`, `company_name`, `website_url`, `company_description`, `location`, `website_summary`).
        *   Format results clearly (string or JSON).
        *   Return formatted data or error message.
        *   Add logging (start, success, error, duration) following `logging-rules.mdc`.

2.  **(DONE) Update Tool Registry (`lib/tools/registry.tool.ts`):**
    *   Import the new `profileContextTool`.
    *   Add `useProfileContext?: boolean;` to `createToolSet` options.
    *   Conditionally add `toolSet.getUserProfileContext = profileContextTool;` if `useProfileContext` is true.
    *   Ensure `widgetTools` does not include this tool.

3.  **(TODO) Update Agent Configuration (`lib/chat-engine/agent-router.ts`):**
    *   Add `useProfileContext: boolean;` to `AgentConfig.toolOptions`.
    *   Enable the option (`true`) for relevant agent types (e.g., `default`, `copywriting`, `google-ads`, `facebook-ads`).

4.  **(TODO) Update Setup Service (`lib/chat-engine/chat-setup.service.ts`):**
    *   Pass the correct `useProfileContext: agentConfig.toolOptions.useProfileContext` flag when calling `createToolSet` within `prepareConfig`.
    *   Ensure `userId` is reliably added to `config.body`.

5.  **(TODO) Update System Prompt (`lib/chat-engine/prompts/base-prompt.ts`):**
    *   Add `getUserProfileContext` and its description to the "AVAILABLE TOOLS" section.

6.  **(TODO) Testing:**
    *   Add unit tests for `profile-context.tool.ts`, mocking the Supabase client and verifying context extraction, DB query, and output formatting.
    *   Update unit tests for `ChatSetupService` to verify the `useProfileContext` flag is handled correctly.
    *   Update/add integration tests (once unblocked) or rely on E2E/manual tests to verify the AI calls the tool appropriately and uses the context.

7.  **(TODO) Documentation:**
    *   Update relevant READMEs (this plan, tools documentation) to include the new tool.
