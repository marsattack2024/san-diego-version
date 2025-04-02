# Chat Engine Refactoring Plan

**Goal:** To break down the monolithic `lib/chat-engine/core.ts` into smaller, focused modules/classes based on the Single Responsibility Principle (SRP), improving readability, testability, and maintainability while adhering to project standards (ESM, Logging, Routing, TypeScript).

## Summary of Accomplishments

The chat engine refactoring has successfully transformed a monolithic codebase into a modular, service-oriented architecture following the Single Responsibility Principle. Key accomplishments include:

1. **Modular Architecture**: Broke down the monolithic `core.ts` file into specialized services:
   - `ApiAuthService` - Handles authentication and authorization
   - `ChatContextService` - Manages context building for chat sessions
   - `AIStreamService` - Handles interaction with AI models
   - `MessagePersistenceService` - Manages database operations for messages

2. **Improved Maintainability**:
   - Each component has a single responsibility
   - Clear interfaces between components
   - Easier to test individual components in isolation
   - Configuration moved to dedicated file

3. **Enhanced Error Handling**:
   - Standardized error responses across all components
   - Comprehensive logging for failures
   - Graceful degradation for non-critical failures

4. **Better Performance**:
   - Non-blocking message persistence
   - Title generation via API call to prevent blocking

5. **Backward Compatibility**:
   - Maintained compatibility with existing code through intelligent re-exports
   - Updated API routes to use new components directly
   - No breaking changes for consumers of the chat engine

6. **Improved Testing**:
   - Individual services can be tested in isolation
   - Dependencies can be mocked more easily
   - Test coverage for critical components

7. **Architecture Pattern Implementation**:
   - Facade Pattern implemented with `ChatEngineFacade`
   - Dependency Injection for service composition
   - Factory functions for simplified component creation

These improvements have resulted in a more maintainable, testable, and robust chat engine implementation that follows modern software engineering best practices while maintaining compatibility with existing code.

**Current Location:** `lib/chat-engine/chat-engine.facade.ts` (main entry point)

**Tracking:**

- [x] Phase 1: Setup & Configuration
- [x] Phase 2: Utilities & Types Extraction
- [x] Phase 3: Authentication Service
- [x] Phase 4: Context Service
- [x] Phase 5: AI Stream Service
- [x] Phase 6: Title Generation Service Integration
- [x] Phase 7: Message Persistence Refinement
- [x] Phase 8: Core Engine Facade Implementation
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

-   [x] **Message Persistence (`lib/chat-engine/message-persistence.ts`)**
    *   The MessagePersistenceService class has already been extracted to its own file with a robust implementation including:
        *   Comprehensive configuration options
        *   Error handling with retries
        *   Structured logging
        *   Functions for saving and retrieving messages

-   [x] **Action Items:**
    *   **Action:** Move the `saveUserMessage` and `saveAssistantMessage` method implementations *from* `core.ts` *into* the `MessagePersistenceService` class.
    *   **Action:** Extract shared logic from both methods into helper functions to reduce code duplication.
    *   **Action:** Enhance error handling in the methods by implementing the `withRetry` function already available in the service.
    *   **Action:** Standardize the format of content across both methods (handle string/object content consistently).
    *   **Action:** Implement a non-blocking save pattern to ensure UI responsiveness is not affected by database operations.
    *   **Action:** Utilize the existing `setupToolsMetadata` helper or create a new one to consistently process tool usage data.
    *   **Action:** Update the function signatures to accept necessary parameters (e.g., `sessionId`, `userId`, `message`, `toolsUsed`).
    *   **Action:** Ensure all direct database interaction logic for loading/saving messages resides *only* within this service.

-   [x] **Implementation Details:**
    *   `saveUserMessage` implemented with:
        *   Validation of required parameters (sessionId, userId)
        *   Proper formatting of content to ensure consistency
        *   Both normal and non-blocking save patterns
        *   Structured logging using `edgeLogger`
        *   Standardized response that includes success/failure status and messageId
    
    *   `saveAssistantMessage` implemented with:
        *   All functionality from `saveUserMessage`
        *   Processing and formatting of tool usage data
        *   Extraction of details from AI SDK responses
        *   Handling of AI content that contains embedded tool calls
        *   Additional metadata in logs about the tools used

-   [x] **Testing Strategy:**
    *   Comprehensive unit tests created for both methods that verify:
        *   Successful saves with proper parameters
        *   Error handling for missing parameters
        *   Correct handling of different content formats (string vs object)
        *   Tool usage data extraction and formatting
        *   Proper logging of operations

-   [x] **Integration:**
    *   Successful integration with the ChatEngine class
    *   Implementation of correct handling of messages from Vercel AI SDK

-   **Why:** Reinforces the separation of concerns. The persistence service now owns all DB interaction details including the details of message formatting and storage. This simplifies the core engine and makes the code more maintainable and testable.
    
-   **Rules:** Follows SRP, ESM, TypeScript. Logging uses `SYSTEM` or `CHAT` category (`logging-rules`). Database interactions are secure and efficient.

## Phase 8: Core Engine Facade Implementation

-   [x] **Core Engine Orchestration (`lib/chat-engine/chat-engine.facade.ts`)**
    *   **Action:** Created new `chat-engine.facade.ts` to implement a lean orchestrator.
    *   **Action:** Implemented constructor injection with all required services: `ApiAuthService`, `ChatContextService`, `AIStreamService`, `MessagePersistenceService`.
    *   **Action:** Defined the main public method `handleRequest` which:
        1.  Parses and validates the incoming `Request` using Zod schema validation.
        2.  Calls the `ApiAuthService` to authenticate users.
        3.  Uses the `ChatContextService` to build the context with message history.
        4.  Calls the `MessagePersistenceService` to save the user message (non-blocking).
        5.  Calls the `AIStreamService` to get streaming AI responses.
        6.  Configures the `onStreamFinish` callback to:
            *   Save the assistant message via `MessagePersistenceService`.
            *   Trigger title generation via `triggerTitleGenerationViaApi`.
            *   Log completion metrics and tool usage statistics.
        7.  Handles top-level error handling with standardized responses and comprehensive logging.
        8.  Applies CORS headers when needed using the `handleCors` utility method.
    *   **Action:** Implemented utility methods for:
        *   Extracting tool usage information from assistant messages
        *   Formatting different message types from various client implementations
        *   Handling timeout conditions with graceful error responses
    *   **Action:** Added a factory function `createChatEngine` to simplify instantiation
    *   **Why:** This implementation follows the facade pattern, creating a central coordinator that delegates specific tasks to specialized services, making the code more maintainable and testable.
    *   **Rules:** Successfully follows Single Responsibility Principle, dependency injection patterns, ESM modules, TypeScript type safety, and uses standardized routing and logging utilities.

## Phase 9: Cleanup & Final Review

-   [x] **Remove Old Code:** 
    *   **Action:** Delete the original monolithic methods from `core.ts` now that the facade is fully functional.
    *   **Action:** Create an entry point in the original `core.ts` location that re-exports the facade to maintain backwards compatibility.
-   [x] **Update Route Handlers:**
    *   **Action:** Updated API routes to import directly from the new facade module:
        * `app/api/chat/route.ts`
        * `app/api/widget-chat/route.ts`
        * `app/api/agent-chat/route.ts`
    *   **Action:** Ensured route handlers follow the standardized patterns from the routing rules documentation.
-   [x] **Update Tests:**
    *   **Action:** Updated the Deep Search integration test to use the new facade module.
    *   **Action:** Maintained backward compatibility for existing tests.
-   [x] **Cross-Origin Support:**
    *   **Action:** Enhanced the `handleCors` utility in `lib/utils/http-utils.ts` to include comprehensive origin support for:
        * Local development (HTTP/HTTPS localhost)
        * Production Vercel deployments
        * Preview deployments via dynamic VERCEL_URL environment variable
    *   **Action:** Ensured proper CORS headers for streaming responses across all environments.
-   [x] **Compatibility Enhancements:**
    *   **Action:** Fixed TypeScript linter errors in the `ChatEngine` extending class by properly initializing and passing all required services.
    *   **Action:** Used the `createChatEngine` factory function within legacy code to maintain type safety and dependency injection patterns.
    *   **Action:** Added detailed deprecation warnings to guide developers toward using the new implementation.
-   [x] **API Documentation:**
    *   **Action:** Created comprehensive documentation for the chat engine endpoints with details on request/response formats.
    *   **Action:** Documented the facade pattern and how services interact with each other in the Summary of Accomplishments section.
-   [x] **End-to-End Testing:**
    *   **Action:** Performed manual testing of the entire chat flow to verify functionality across services.
    *   **Action:** Verified proper streaming responses, tool calls, and message persistence in all environments.
-   [x] **Final Code Review:** 
    *   **Action:** Reviewed all changes for adherence to SRP, project rules (ESM, Logging, Routing, Types), and overall clarity.
    *   **Action:** Ensured consistent error handling and logging across all services.
    *   **Action:** Verified that all edge cases are properly handled, including CORS for cross-origin requests.
-   [x] **Documentation Update:**
    *   **Action:** Updated this document with final architecture details and implementation notes.
    *   **Action:** Added a comprehensive summary of accomplishments at the top of the document.
    *   **Action:** Documented specific improvements in error handling, performance, and backward compatibility.

The chat engine refactoring is now complete! The monolithic implementation has been successfully transformed into a modular, service-oriented architecture that follows the Single Responsibility Principle. All components are properly documented, tested, and integrated with the existing codebase, ensuring a smooth transition for developers.

---

**SDKs and Libraries:**

*   **Vercel AI SDK (`ai`, `@ai-sdk/openai`):** Remains central for AI interaction.
*   **Supabase (`@supabase/ssr`, `@/utils/supabase/...`):** Used for authentication and database persistence.
*   **Zod:** Recommended for input validation (request body, config).
*   **Logging (`edgeLogger`, `chatLogger`):** Use existing loggers, ensuring adherence to `logging-rules.mdc`.
*   **Dependency Injection:** Manual constructor injection is sufficient.
*   **API Calls:** Native `fetch` for internal API calls (title generation). Nextjs 15,2, review readme in /docs for routing.