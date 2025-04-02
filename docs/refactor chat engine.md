# Chat Engine Refactoring Plan

**Goal:** To break down the monolithic `lib/chat-engine/core.ts` into smaller, focused modules/classes based on the Single Responsibility Principle (SRP), improving readability, testability, and maintainability while adhering to project standards (ESM, Logging, Routing, TypeScript).

**Current Location:** `lib/chat-engine/core.ts`

**Tracking:**

- [x] Phase 1: Setup & Configuration
- [x] Phase 2: Utilities & Types Extraction
- [x] Phase 3: Authentication Service
- [x] Phase 4: Context Service
- [x] Phase 5: AI Stream Service
- [x] Phase 6: Title Generation Service Integration
- [ ] Phase 7: Message Persistence Refinement
- [ ] Phase 8: Core Engine Facade Implementation
- [ ] Phase 9: Cleanup & Final Review

---

## Phase 1: Setup & Configuration

-   [x] **Create Directories:**
    *   Create `lib/auth/`
    *   Create `lib/chat-engine/services/`
    *   Create `lib/chat-engine/utils/`
    *   Create `lib/utils/` subdirectories as needed (e.g., `async-utils.ts`, `misc-utils.ts`).
-   [x] **Configuration Management (`lib/chat-engine/chat-engine.config.ts`)**
    *   **Action:** Move the `ChatEngineConfig` interface definition from `core.ts` to a new file `lib/chat-engine/chat-engine.config.ts`.
    *   **Action:** Consider adding a helper function/class within this file to process/validate the configuration (handle defaults, environment variables, overrides like `body?.deepSearchEnabled`). Use Zod for validation if not already done.
    *   **Why:** Separates the definition of the configuration shape and its processing from the engine's runtime logic.
    *   **Rules:** Follows ESM, TypeScript best practices.

## Phase 2: Utilities & Types Extraction

-   [x] **Utility Functions:**
    *   **Action:** Move utility functions from `core.ts` to appropriate locations:
        *   `maskUserId`, `generateOperationId` -> Create `lib/utils/misc-utils.ts` (or similar like `string-utils.ts`).
        *   `handleCors` -> Move to `lib/utils/route-handler.ts` or create `lib/utils/http-utils.ts`. Ensure it aligns with standard `Response` object usage (`routing-rules`).
        *   `extractToolsUsed` -> Create `lib/chat-engine/utils/tool-utils.ts` (as it's engine-specific).
        *   `createTimeoutHandler` -> Create `lib/utils/async-utils.ts`.
    *   **Why:** Group utility functions logically, improving organization and potential reusability.
    *   **Rules:** Follow ESM. Ensure `handleCors` produces standard `Response` objects.
-   [x] **Types (`lib/chat-engine/types.ts` or consolidate)**
    *   **Action:** Move engine-specific types like `ChatEngineContext` from `core.ts` to a new `lib/chat-engine/types.ts`.
    *   **Action:** Ensure core types like `Message` are imported from the existing `types/core/chat.ts`.
    *   **Why:** Central place for related type definitions, improving type safety and organization.
    *   **Rules:** Follows TypeScript best practices, leverages existing type structure.

## Phase 3: Authentication Service

-   [x] **Request Authentication (`lib/auth/api-auth.service.ts`)**
    *   **Action:** Create `lib/auth/api-auth.service.ts`. Move the `handleAuth` method logic from `core.ts` into this new service class/module.
    *   **Action:** Ensure it handles both token and cookie-based checks using Supabase (leveraging `createClient` from `@/utils/supabase/server` or potentially route/server client utilities).
    *   **Action:** Refactor the output to return user information or throw/return standardized errors (e.g., using `unauthorizedError` from `lib/utils/route-handler.ts`).
    *   **Why:** Authentication is a cross-cutting concern. Centralizing it promotes reusability and decouples chat logic from auth specifics. Aligns with `organization-rules`.
    *   **Rules:** Follows SRP, ESM, TypeScript. Logging should use `AUTH` category (`logging-rules`). Return values/errors should align with `routing-rules` utility functions.

## Phase 4: Context Service

-   [x] **Chat Context Management (`lib/chat-engine/services/chat-context.service.ts`)**
    *   **Action:** Create `lib/chat-engine/services/chat-context.service.ts`. Move the `createContext` method logic from `core.ts` here.
    *   **Action:** This service will be responsible for: generating request IDs, extracting URLs, and importantly, calling the `MessagePersistenceService` (to be injected) to load previous messages.
    *   **Action:** Ensure it returns the `ChatEngineContext` object.
    *   **Why:** Encapsulates the steps needed to prepare the full context required for AI processing. Makes the main engine cleaner.
    *   **Rules:** Follows SRP, ESM, TypeScript. Logging for history loading should use `CHAT` or `SYSTEM` category (`logging-rules`).

## Phase 5: AI Stream Service

-   [x] **Core AI Interaction (`lib/chat-engine/services/ai-stream.service.ts`)**
    *   **Action:** Create `lib/chat-engine/services/ai-stream.service.ts`. Move the core logic involving the `streamText` invocation from `processRequest` in `core.ts` here.
    *   **Action:** This includes setting up parameters (`model`, `messages`, `system`, `tools`, `temperature`, etc.) and handling the raw `onStepFinish` and `onFinish` callbacks.
    *   **Action:** The service should accept the `ChatEngineContext` and configuration, and return the `StreamTextResult` or the `Response` object directly.
    *   **Action:** Callbacks (`onFinish`) within this service will be simplified later to delegate tasks (like persistence, title generation) to other injected services.
    *   **Why:** Isolates the direct dependency and interaction specifics of the Vercel AI SDK's `streamText`. Separates the "how" of AI interaction from the "what" the engine orchestrates.
    *   **Rules:** Follows SRP, ESM, TypeScript. Adheres strictly to Vercel AI SDK patterns (`project-rules`). Logging should use `LLM` category (`logging-rules`).

## Phase 6: Title Generation Service Integration

-   [x] **Session Title Generation (`lib/chat/title-service.ts` & `/api/chat/update-title`)**
    *   **Action:** Confirmed architecture decision: Use API call trigger.
    *   **Action:** Modified `lib/chat/title-service.ts` (`triggerTitleGenerationViaApi`) to check conditions and make `fetch` call to `/api/chat/update-title`.
    *   **Action:** Moved `cleanTitle`, `updateTitleInDatabase` to `lib/chat/title-utils.ts`.
    *   **Action:** Modified API route `/api/chat/update-title/route.ts` to perform AI generation (`generateText`) and DB update (`updateTitleInDatabase`) directly.
    *   **Action:** Refined logging calls in both files to match logger capabilities and resolve linter errors.
    *   **Why:** Decouples title generation trigger from implementation, allows independent scaling/deployment, aligns with testing strategy.
    *   **Rules:** Follows SRP, ESM, TypeScript. API call logic robust. Logging adheres to rules. Frontend/Backend separation.

## Phase 7: Message Persistence Refinement

-   [ ] **Message Persistence (`lib/chat-engine/message-persistence.ts`)**
    *   **Action:** Move the `saveUserMessage` and `saveAssistantMessage` method implementations *from* `core.ts` *into* the `MessagePersistenceService` class.
    *   **Action:** Refactor these methods to accept necessary parameters (e.g., `sessionId`, `userId`, `message`, `toolsUsed`).
    *   **Action:** Ensure all direct database interaction logic for loading/saving messages resides *only* within this service.
    *   **Action:** The `onFinish` callback in the `AIStreamService` (and the initial user message saving logic) will now simply call these methods on the injected `MessagePersistenceService` instance.
    *   **Why:** Reinforces the separation of concerns. The persistence service owns all DB interaction details.
    *   **Rules:** Follows SRP, ESM, TypeScript. Logging should use `SYSTEM` or `CHAT` category (`logging-rules`). Ensure database interactions are secure and efficient.

## Phase 8: Core Engine Facade Implementation

-   [ ] **Core Engine Orchestration (`lib/chat-engine/chat-engine.facade.ts` or rename `core.ts`)**
    *   **Action:** Refactor the original `ChatEngine` class in `core.ts` (or create a new `chat-engine.facade.ts` and rename later) into a lean orchestrator.
    *   **Action:** Implement constructor injection. The facade will depend on: `ApiAuthService`, `ChatContextService`, `AIStreamService`, `MessagePersistenceService`, `TitleGenerationService`.
    *   **Action:** Define the main public method (e.g., `handleRequest`). This method will:
        1.  Parse/validate the incoming `Request` (using Zod).
        2.  Call the `ApiAuthService` to authenticate.
        3.  Call the `ChatContextService` to build context.
        4.  Call the `MessagePersistenceService` to save the initial user message (non-blocking).
        5.  Call the `AIStreamService` to get the streaming response.
        6.  Modify the `AIStreamService`'s `onFinish` callback handler (passed during the call or configured) to delegate:
            *   Saving the assistant message via `MessagePersistenceService`.
            *   Triggering title generation via `TitleGenerationService`.
        7.  Handle top-level error handling & logging orchestration, using standardized responses (`route-handler.ts`).
        8.  Apply CORS using the extracted utility if needed.
    *   **Why:** This class becomes the central coordinator, delegating tasks. It clarifies the overall flow and dependencies.
    *   **Rules:** Follows SRP, DI pattern, ESM, TypeScript. Uses standardized routing utilities (`routing-rules`). Orchestrates logging according to `logging-rules` (e.g., overall request duration, consolidated logs).

## Phase 9: Cleanup & Final Review

-   [ ] **Remove Old Code:** Delete the original monolithic methods from `core.ts` once the facade is fully functional.
-   [ ] **Update Imports:** Ensure all imports across the modified files point to the new locations.
-   [ ] **Code Review:** Review all changes for adherence to SRP, project rules (ESM, Logging, Routing, Types), and overall clarity.
-   [ ] **Testing:** (Manual or Automated) Verify core chat functionality, authentication, message persistence, and title generation are working correctly.
-   [ ] **Documentation:** Update this README and any other relevant documentation to reflect the new architecture.

---

**SDKs and Libraries:**

*   **Vercel AI SDK (`ai`, `@ai-sdk/openai`):** Remains central for AI interaction.
*   **Supabase (`@supabase/ssr`, `@/utils/supabase/...`):** Used for authentication and database persistence.
*   **Zod:** Recommended for input validation (request body, config).
*   **Logging (`edgeLogger`, `chatLogger`):** Use existing loggers, ensuring adherence to `logging-rules.mdc`.
*   **Dependency Injection:** Manual constructor injection is sufficient.
*   **API Calls:** Native `fetch` for internal API calls (title generation).