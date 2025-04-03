# Testing Strategy & Status

This directory contains tests for the application, organized by test type, following the guidelines in `docs/README testing.md`.

## Current Status (Post-Engine Refactor)

*   **Unit Tests (`tests/unit/`):** Generally **PASSING**. Tests for individual services, utilities, and chat engine components (including the new `ChatSetupService`) are functional. This provides confidence in the isolated logic of the refactored components.
*   **Integration Tests (`tests/integration/api`):** Currently **FAILING**. The integration tests attempting to validate the full flow of `/api/chat/route.ts` and `/api/widget-chat/route.ts` encounter an **environment incompatibility issue**. Specifically, a dependency (`@/utils/supabase/server.ts`, likely via `ApiAuthService`) uses React's `cache()` function, which executes during module loading and fails within the Node.js test environment used by Vitest. Standard mocking techniques within the test files have been insufficient to prevent this module-level error during the integration test setup.
*   **Overall:** The core application logic refactoring (using `ChatSetupService`) appears structurally sound and aligns with SRP/Vercel patterns based on passing unit tests. However, automated end-to-end verification via *deep* integration tests in the Node environment is currently blocked. Confidence in the full flow relies on unit tests, planned "shallow" integration tests, manual verification, and E2E tests.

## Test Types & Structure

- **Unit Tests (`tests/unit/`):** Test individual functions/modules/classes in isolation. Dependencies are heavily mocked. (Currently Stable)
- **Integration Tests (`tests/integration/`):** Test interactions between key modules. Due to environment issues, API route integration tests will be refactored to be "shallow" (see Next Steps). Other integration tests (e.g., service-to-service) may be feasible.
- **Helpers (`tests/helpers/`):** Reusable utilities (mock logger, mock clients, test data, env loader).
- **Setup (`tests/setup.ts`):** Global configuration (env vars, global mocks).
- **Fixtures (`tests/fixtures/`):** Static data fixtures.

## Refactoring & Consistency

*   **Application Code:** The recent refactoring introducing `ChatSetupService` is considered **proper and well-structured**, aligning with SRP and standard Vercel AI SDK patterns. The application structure should *not* be reverted due to testing challenges.
*   **Test Code:**
    *   **Consistency:** Unit tests largely follow consistent, working patterns (mocking before import, using factories, resetting mocks).
    *   **Inconsistency/Problem:** The *integration tests* for API routes failed because the established mocking patterns struggled against the Node vs. React `cache()` environment incompatibility triggered during dependency loading. The failures stemmed from the **test setup's interaction with the environment**, not fundamental flaws in the application code's refactored logic.

## Key Testing Patterns (Refer to `docs/README testing.md` for details)

1.  **Mocking:** Use `vi.mock('path', () => ({ exportName: vi.fn() }))` factory pattern before imports for unit tests. Integration tests require careful consideration of mocking boundaries due to environment issues.
2.  **Reset:** Use `vi.resetAllMocks()` and `mockLogger.reset()` in `beforeEach`.
3.  **Accessing Mocks:** Import mocked modules after `vi.mock` and use `vi.mocked()` for type safety and setting behavior in `beforeEach`/`it`.
4.  **Helpers:** Utilize shared mocks from `tests/helpers`. `setupLoggerMock()` is crucial.

## Next Steps for Testing (Adjusted Strategy)

1.  **Manual Verification:** **(PENDING)** Perform manual smoke testing of `/api/chat` and `/api/widget-chat` as outlined in `docs/agent refactor plan.md` (Step 8.D) to gain immediate confidence in the refactored application logic.
2.  **Refactor Integration Tests (Shallow Approach):** **(TODO)** Modify the failing integration tests (`tests/integration/api/chat-route.test.ts`, `tests/integration/api/widget-chat-route.test.ts`) to mock the direct service dependencies (specifically `ChatSetupService.prepareConfig` and the facade returned by `createChatEngine`). Focus these tests on verifying the route handler's *own* logic: request parsing, authentication flow, basic validation, correct calls to the (mocked) services, and error handling. This bypasses the environment incompatibility while still testing the route layer.
3.  **Ensure Robust Unit & E2E Coverage:** **(ONGOING/TODO)** Verify thorough unit tests exist for `ChatSetupService` (Done) and other critical services/utils. Rely on End-to-End tests (e.g., Playwright) for true validation of the complete user flow in a realistic environment, covering tool usage triggered by UI flags.
4.  **Address Coverage Gaps:** **(TODO)** Implement unit tests for areas previously identified in `docs/README testing.md` (Zustand store, UI components, history sync).
5.  **Document Strategy:** **(DONE via this update)** Ensure this README accurately reflects the adjusted testing strategy necessitated by environment limitations.

## Authentication Testing

### Title Generation Authentication Flow

The title generation authentication flow is tested in both unit and integration tests:

- **Unit Test**: `tests/unit/api/title-generation-auth.test.ts` verifies that:
  - The API properly uses Supabase auth.getUser() for authentication
  - It correctly falls back to session lookup if authentication fails
  - It returns appropriate error responses for unauthorized requests
  - All authentication operations are properly logged

- **Integration Test**: `tests/integration/auth/title-generation-flow.test.ts` tests the complete flow, including:
  - Authentication via cookies
  - Session-based authentication fallback
  - Error handling and logging
  - API response structure

### Running the Tests

To run the title generation authentication tests:

```bash
# Run just the unit test
./scripts/run-title-auth-test.sh

# Run all authentication tests
npx vitest run tests/unit/api/title-generation-auth.test.ts tests/integration/auth/title-generation-flow.test.ts

# Run all tests (Note: Integration tests in /api will currently fail)
npm test
```

## Testing Guidelines

1. **Mocking**: Always set up mocks before importing the code under test (especially for unit tests).
2. **Logging**: Verify that appropriate logging occurs for both successful and failed operations.
3. **Error Handling**: Test both happy paths and error cases.
4. **Authentication**: For auth-related tests, verify both primary and fallback authentication methods.
5. **Isolation**: Keep unit tests isolated. Integration tests should mock external/problematic boundaries.

## Debugging Test Failures

If authentication tests fail, check:

1. Cookie handling in the request/response cycle
2. Supabase client configuration and mocks
3. Session lookup fallback logic
4. Error handling and status codes
5. Log output for error details

If **integration tests fail with environment errors** (like `cache is not a function`), verify mocks for problematic dependencies (`@/utils/supabase/server.ts`) are correctly applied globally (`tests/setup.ts`) and consider the "Shallow Integration Test" approach described in "Next Steps". 