# Testing Strategy

This directory contains tests for the application, organized by test type.

## Test Types

- **Unit Tests**: Located in `tests/unit/`, these test individual functions and components in isolation.
- **Integration Tests**: Located in `tests/integration/`, these test how multiple components work together.
- **Helpers**: Located in `tests/helpers/`, these provide testing utilities and mocks.
- **Fixtures**: Located in `tests/fixtures/`, these provide test data.

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

# Run all tests
npm test
```

## Testing Guidelines

1. **Mocking**: Always set up mocks before importing the code under test.
2. **Logging**: Verify that appropriate logging occurs for both successful and failed operations.
3. **Error Handling**: Test both happy paths and error cases.
4. **Authentication**: For auth-related tests, verify both primary and fallback authentication methods.
5. **Isolation**: Keep tests isolated and avoid dependencies on external services where possible.

## Debugging Test Failures

If authentication tests fail, check:

1. Cookie handling in the request/response cycle
2. Supabase client configuration
3. Session lookup fallback logic
4. Error handling and status codes
5. Log output for error details 