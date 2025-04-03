# Testing Next.js Route Handlers

This document outlines best practices for testing Next.js route handlers using Vitest, specifically in the context of the Edge Runtime, API routes, and the standardized `@supabase/ssr` authentication pattern.

## Core Principles

When testing Next.js route handlers:

1.  **Isolate the Handler**: Focus tests on the route handler's logic itself, not its dependencies.
2.  **Mock Dependencies**: Use `vi.mock()` to mock *all* external dependencies (Supabase clients, services, utilities) before importing the handler.
3.  **Account for Hoisting**: Define mocks within factory functions passed to `vi.mock()` to avoid hoisting-related reference errors.
4.  **Test Request Parsing**: Verify the handler correctly parses request bodies, headers, and URL parameters.
5.  **Test Response Formatting**: Ensure the handler returns standard `Response` objects with correct status codes, headers, and body formats (e.g., JSON).
6.  **Verify Authentication/Authorization**: Test behavior with both authenticated and unauthenticated users, and check admin privileges if applicable, by mocking the `getUser()` response.
7.  **Test Error Handling**: Explicitly test scenarios where dependencies throw errors or validation fails.
8.  **Environment Isolation**: Avoid reliance on actual environment variables or external services.

## Common Testing Challenges & Solutions

### Hoisting Issues

Vitest hoists `vi.mock()` calls. Define mocks inside factory functions:

```typescript
// ✅ CORRECT:
vi.mock('@/lib/services/some-service', () => ({
  someFunction: vi.fn() // Define mock inside factory
}));

// Import AFTER mocks
import { someFunction } from '@/lib/services/some-service';

// Use the mock
vi.mocked(someFunction).mockResolvedValue('mock result');
```

### Mocking `next/headers`

Mock `cookies()` from `next/headers`:

```typescript
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]), // Mock specific cookie methods as needed
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    // Mock other methods like set, delete if used
  }),
  headers: vi.fn().mockReturnValue(new Headers()), // Mock headers function if used
}));
```

### Mocking Supabase Clients (`@supabase/ssr`)

Mock the *specific* client utility used by your route handler (usually `createRouteHandlerClient` from `lib/supabase/route-client.ts`):

```typescript
// Example mock for route handler client
const mockSupabase = {
  auth: {
    // Mock getUser to simulate different auth states
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) 
  },
  // Mock database operations
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockResolvedValue({ data: [{ id: '123' }], error: null }),
  update: vi.fn().mockResolvedValue({ data: [{ id: '123' }], error: null }),
  delete: vi.fn().mockResolvedValue({ error: null }),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: '123' }, error: null }),
  // Add mocks for other Supabase methods used (rpc, etc.)
};

vi.mock('@/lib/supabase/route-client', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase)
}));
```

**Simulating Auth States:**

```typescript
import { createClient } from '@/lib/supabase/route-client';

// Simulate unauthenticated user
vi.mocked(createClient).mockResolvedValue({
  ...mockSupabase, // Spread base mock
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }
});

// Simulate authenticated user
const mockUser = { id: 'user-123', email: 'test@example.com', app_metadata: {} };
vi.mocked(createClient).mockResolvedValue({
  ...mockSupabase,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) }
});

// Simulate authenticated admin user (assuming JWT claims are used)
const mockAdminUser = { ...mockUser, app_metadata: { is_admin: true } };
vi.mocked(createClient).mockResolvedValue({
  ...mockSupabase,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) }
});
```

## Step-by-Step Testing Approach

1.  **Setup Logger Mock**: Use a helper like `setupLoggerMock()` first.
2.  **Mock ALL Dependencies**: Use `vi.mock()` for every external import used by the handler *before* importing the handler itself.
3.  **Import Handler**: `import { GET, POST } from '@/app/api/your-route/route';`
4.  **Test Suite Setup**: Use `describe`, `beforeEach`, `afterEach`.
    ```typescript
    describe('API Route: /api/your-route', () => {
      beforeEach(() => {
        vi.resetAllMocks(); // Essential for test isolation
        mockLogger.reset();
      });
      // Tests...
    });
    ```
5.  **Test Each HTTP Method**: Create separate `it` blocks for `GET`, `POST`, `DELETE`, etc.
6.  **Arrange**: Set up mock return values (e.g., simulate auth state, database responses).
7.  **Act**: Construct a `Request` object and call the handler function.
8.  **Assert**: Check the `Response` status, headers, and parsed body (`await response.json()`). Verify mock calls (`expect(mockFunction).toHaveBeenCalled...`).

## Example: Testing an Authenticated Route

```typescript
/**
 * Tests for /api/chat/history route
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { createClient } from '@/lib/supabase/route-client'; // Mock this
import { historyService } from '@/lib/api/history-service'; // Mock this

// Setup mocks FIRST
setupLoggerMock();

// Mock Supabase client utility
const mockSupabase = { /* ... standard mock object ... */ };
vi.mock('@/lib/supabase/route-client', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase)
}));

// Mock the history service
vi.mock('@/lib/api/history-service', () => ({
  historyService: {
    fetchHistory: vi.fn().mockResolvedValue([{ id: 'chat1', title: 'Chat 1' }])
  }
}));

// Mock next/headers
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

// Import the route handler AFTER mocks
import { GET } from '@/app/api/history/route';

describe('API Route: /api/history', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com', app_metadata: {} };

  beforeEach(() => {
    vi.resetAllMocks();
    mockLogger.reset();
    // Default to authenticated user for most tests
    vi.mocked(createClient).mockResolvedValue({ 
      ...mockSupabase, 
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) }
    });
  });

  it('should return 401 if user is not authenticated', async () => {
    // Arrange: Simulate unauthenticated user
    vi.mocked(createClient).mockResolvedValue({ 
      ...mockSupabase, 
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }
    });
    
    const req = new Request('http://localhost/api/history');

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Authentication required');
    expect(historyService.fetchHistory).not.toHaveBeenCalled();
  });

  it('should return chat history for authenticated user', async () => {
    // Arrange
    const req = new Request('http://localhost/api/history');

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([{ id: 'chat1', title: 'Chat 1' }]);
    // Verify historyService was called with the correct client instance
    expect(historyService.fetchHistory).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }), // Check if a supabase client was passed
      false // Assuming forceRefresh default is false
    );
  });

  it('should handle errors from historyService', async () => {
    // Arrange: Mock historyService to throw an error
    vi.mocked(historyService.fetchHistory).mockRejectedValue(new Error('Database exploded'));
    const req = new Request('http://localhost/api/history');

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('Failed to fetch history');
  });
});
```

## Key Patterns to Note

1.  **Dependency Injection Testing**: When testing services like `historyService` that use dependency injection, verify that the correct dependencies (like the Supabase client instance) are passed in.
2.  **Mock Granularity**: Mock functions at the level they are imported/used by the route handler.
3.  **Auth State Simulation**: Use `vi.mocked(createClient).mockResolvedValue(...)` combined with different `auth.getUser` mock implementations to simulate various authentication scenarios.
4.  **Error Simulation**: Use `vi.mocked(dependencyFunction).mockRejectedValue(...)` to test how the handler reacts to errors from its dependencies.

## Common Pitfalls to Avoid

1.  **Forgetting `vi.resetAllMocks()`**: Leads to mocks leaking between tests.
2.  **Incorrect Mock Path**: Ensure the path in `vi.mock()` matches the exact import path used in the route handler.
3.  **Not Awaiting Async Mocks**: If a mock function is async, remember to `await` its call in your assertions if necessary.
4.  **Over-Mocking**: Only mock direct dependencies of the route handler. Avoid mocking functions *called by* those dependencies unless absolutely necessary.

## Debugging Test Failures

1.  **Inspect Mock Calls**: `console.log(vi.mocked(func).mock.calls)`
2.  **Check Logger Output**: Review `mockLogger` calls.
3.  **Isolate Test**: Run the failing test exclusively (`it.only(...)`).
4.  **Verify Mock Setup**: Double-check mock paths and factory function definitions.

## Best Practices Summary

1.  **Mock First, Import Last**: Ensure all mocks are defined before any imports of the code under test.
2.  **Isolate Tests**: Use `beforeEach` with `vi.resetAllMocks()`.
3.  **Test Auth States**: Cover authenticated, unauthenticated, and admin scenarios.
4.  **Test Errors**: Simulate dependency failures and validate error responses.
5.  **Verify Mock Interactions**: Check that dependencies were called with expected arguments.

By following these guidelines, we can effectively test Next.js route handlers using `@supabase/ssr`, ensuring they are robust, secure, and behave correctly under various conditions. 