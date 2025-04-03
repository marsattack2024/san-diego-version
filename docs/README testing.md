# Testing Framework

This document outlines our standardized testing approach using Vitest for the San Diego application, incorporating best practices and solutions for common issues.

for more details refer to: /Users/Humberto/Documents/GitHub/backups/during lint/san-diego-version/docs/README testing.md

## Framework Overview

We use **Vitest** as our primary testing framework, which offers:

- Native ESM support (crucial for our Next.js project)
- Fast parallel test execution
- TypeScript integration
- Intuitive mocking capabilities
- Code coverage reporting

## Directory Structure

The test structure mirrors the source code:

```
tests/
├── helpers/             # Shared testing utilities
│   ├── env-loader.ts    # Environment variable handling
│   ├── mock-logger.ts   # Mock implementation of the logger
│   ├── mock-clients.ts  # Mock implementations of external services (Supabase, Redis, etc.)
│   ├── test-utils.ts    # Core testing utilities (sleep, global setup/teardown)
│   └── test-data/       # Mock data for tests
│       └── mock-data.ts # Predefined test data
│
├── unit/                # Unit tests for individual components/modules
│   ├── lib/             # Tests for /lib code
│   ├── services/        # Tests for /lib/services code
│   ├── components/      # Tests for /components code
│   └── chat-engine/     # Tests for /lib/chat-engine code
│   └── api/             # Unit tests for API route logic (mocking engine/services)
│
├── integration/         # Integration tests across components
│   ├── api/             # Tests calling API endpoints (e.g., using fetch)
│   └── services/        # Tests integrating multiple internal services
│   └── auth/            # Tests for authentication flows
│
├── setup.ts             # Global setup/teardown for all tests (env vars, global mocks)
└── fixtures/            # (If needed) Static data fixtures for tests
```
*(Self-Correction: Added `api` under `unit` and `auth` under `integration` based on observed structure)*

## Core Testing Utilities (`tests/helpers/`)

- **`env-loader.ts`**: Loads `.env.test` (falling back to `.env`), sets default log level, provides typed access (`testEnv`).
- **`mock-logger.ts`**: Mocks `edgeLogger` to prevent console clutter, capture logs, assert messages. Includes `setupLoggerMock()` to apply mocks correctly. *Must be called BEFORE importing modules that use the logger.*
- **`mock-clients.ts`**: Contains mock implementations for external services (Supabase, Redis, AI SDK). Useful for consistent mocking across tests.
- **`test-utils.ts`**: Includes `sleep`, `globalSetup`, `globalTeardown`.
- **`test-data/mock-data.ts`**: Centralized mock data objects.

## Global Setup (`tests/setup.ts` & `vitest.config.ts`)

- **`tests/setup.ts`**: Runs once before all tests. Uses `globalSetup`/`globalTeardown` from `test-utils`. Configured in `vitest.config.ts` via `setupFiles`.
- **`vitest.config.ts`**: Configures test environment (`node`), includes/excludes files, sets timeout, enables `clearMocks`, defines path aliases (`@/`).

## Mocking Approach with Vitest

### Key Principles:
1.  **Mock BEFORE Import:** Always define `vi.mock()` calls *before* importing the module that uses the mocked dependency. Vitest hoists mocks.
2.  **Reset Mocks:** Use `vi.resetAllMocks()` or `vi.clearAllMocks()` in `beforeEach` to ensure test isolation.
3.  **Factory Functions:** Use factory functions (`vi.mock('path', () => { ... })`) to define mocks, especially for ESM modules or when referencing local variables within the mock.
4.  **Partial Mocking:** Use `vi.mock('path', async (importOriginal) => { ... })` to mock only specific parts of a module while keeping others real.

### Common Mocking Patterns & Solutions:

*(Examples consolidated from testing-guide.md and test-mocking-cheatsheet.md)*

**1. Vercel AI SDK (`ai` package):**
   ```typescript
   vi.mock('ai', () => {
     const mockResponse = { /* ... text, toolCalls, etc. ... */ };
     const streamTextMock = vi.fn().mockResolvedValue(mockResponse);
     const toolMock = vi.fn(/* ... implementation ... */);
     return { streamText: streamTextMock, tool: toolMock, generateObject: vi.fn(), /* other exports */ };
   });
   ```

**2. `fetch` API:**
   ```typescript
   beforeEach(() => {
     const mockFetch = vi.fn().mockResolvedValue({
       ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('')
     });
     vi.stubGlobal('fetch', mockFetch);
   });
   afterEach(() => { vi.unstubAllGlobals(); });
   ```

**3. Supabase Client (`@/utils/supabase/server` or route-client):**
   ```typescript
   const mockSupabase = {
     from: vi.fn().mockReturnThis(),
     select: vi.fn().mockReturnThis(),
     eq: vi.fn().mockReturnThis(),
     // ... other methods (update, maybeSingle, etc.) ...
     auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }) }
   };
   vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(() => mockSupabase) }));
   vi.mock('@/lib/supabase/route-client', () => ({ createRouteHandlerClient: vi.fn(() => mockSupabase) }));

   // Usage: const client = createClient() as unknown as SupabaseClient;
   ```

**4. Redis Client (`@upstash/redis` or `@/lib/utils/redis-client`):**
   ```typescript
   // (Using in-memory store pattern from cheatsheet)
   vi.mock('@upstash/redis', () => {
     const mockStore = new Map<string, any>();
     /* ... expiration logic ... */
     return {
       Redis: {
         fromEnv: vi.fn().mockReturnValue({
           set: vi.fn(/* implementation using mockStore */),
           get: vi.fn(/* implementation using mockStore & expirations */),
           del: vi.fn(/* ... */),
           exists: vi.fn(/* ... */),
         })
       }
     };
   });
   // Also mock the local client if used directly
   vi.mock('@/lib/utils/redis-client', () => ({ getRedisClient: vi.fn(/* ... */) }));
   ```

**5. Logger (`@/lib/logger/edge-logger` & specific loggers):**
   *Use `setupLoggerMock()` from `tests/helpers/mock-logger.ts`. It handles mocking `edgeLogger` and includes constants like `LOG_CATEGORIES`.*
   ```typescript
   import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
   setupLoggerMock(); // Call BEFORE importing code that logs

   // ... later in test ...
   expect(mockLogger.info).toHaveBeenCalledWith(/* ... */);
   ```

**6. Route Handler Utilities (`@/lib/utils/route-handler`):**
   ```typescript
   vi.mock('@/lib/utils/route-handler', () => ({
     successResponse: vi.fn((data) => new Response(JSON.stringify(data), { status: 200, /* ...headers */ })),
     errorResponse: vi.fn((msg, err, status=500) => new Response(JSON.stringify({ error: msg }), { status, /* ...headers */ })),
     // ... unauthorizedError, validationError, notFoundError ...
   }));
   ```

### Handling Type Safety:
- Use `as unknown as Type` for mocks when TypeScript complains (`const client = createClient() as unknown as SupabaseClient;`).
- Use `expect.objectContaining<Partial<Interface>>({ ... })` for typed partial object matching in assertions.

## Logging Standards in Tests

- **Mock the Logger:** Use `setupLoggerMock()` and `mockLogger`.
- **Reset:** Use `mockLogger.reset()` in `beforeEach`.
- **Assert:** Use `expect(mockLogger.level).toHaveBeenCalledWith(...)`. Check for message content and `expect.objectContaining` for context/metadata. Use `mockLogger.hasLogsMatching` for flexible checks.

## Running Tests

```bash
npm test # Run all tests
npm run test:watch # Run in watch mode
npm run test:ui # Run with Vitest UI
npm run test:coverage # Run with coverage report
```

## Current Test Coverage & Gaps

*(Note: This needs regular updating, based on `testing-status.md` or coverage reports)*

**Covered:**
- Document Retrieval (RAG)
- Web Scraper Tool/Service
- Logger Implementation
- Cache Service (Basic placeholder exists)
- Environment Loading
- Perplexity Service
- Deep Search Tool
- Supabase RPCs
- Title Generation Service
- Tool Usage Persistence

**Gaps (Needs Implementation):**
- **`stores/chat-store.ts` (Zustand):** Core state logic, actions, persistence.
- **UI Components:** e.g., `sidebar-history.tsx` (rendering, store interaction).
- **Chat History Sync:** Polling, cache invalidation, error handling between UI/DB.
- **`lib/chat-engine/chat-setup.service.ts`:** Unit tests for the new service (Step 8 of refactor plan).
- **Integration Tests:** For the refactored `/api/chat/route.ts` and `/api/widget-chat/route.ts` (Step 8 of refactor plan).

## Example Test (Unit Test Pattern)

```typescript
// 1. Imports
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// 2. Mocks (BEFORE importing module under test)
setupLoggerMock();
vi.mock('@/lib/dependency1', () => ({ /* ... mock implementation ... */ }));
vi.mock('@/lib/dependency2', () => ({ /* ... mock implementation ... */ }));

// 3. Import module under test
import { ServiceUnderTest } from '@/lib/service-under-test';

// 4. Test Suite
describe('ServiceUnderTest', () => {
  let service: ServiceUnderTest;

  beforeEach(() => {
    // Reset mocks for isolation
    vi.resetAllMocks(); // Or vi.clearAllMocks()
    mockLogger.reset();

    // (Re)Initialize service instance if needed
    service = new ServiceUnderTest(/* Pass mocked dependencies if constructor requires */);
  });

  it('should perform core function correctly', async () => {
    // Arrange: Configure mock return values for this specific test
    const dep1Mock = await import('@/lib/dependency1');
    vi.mocked(dep1Mock.someFunction).mockResolvedValue('mock data');

    // Act: Call the method being tested
    const result = await service.coreFunction('input');

    // Assert: Check return value, side effects (mock calls, logs)
    expect(result).toEqual('expected outcome');
    expect(dep1Mock.someFunction).toHaveBeenCalledWith('input');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Core function executed',
      expect.objectContaining({ status: 'success' })
    );
  });

  it('should handle errors gracefully', async () => {
    // Arrange: Configure mock to throw an error
    const dep1Mock = await import('@/lib/dependency1');
    const testError = new Error('Dependency failed');
    vi.mocked(dep1Mock.someFunction).mockRejectedValue(testError);

    // Act: Call the method
    const result = await service.coreFunction('input');

    // Assert: Check fallback behavior, error logging
    expect(result).toEqual('fallback outcome'); // Or expect(() => service.coreFunction()).rejects.toThrow(...)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Core function failed',
      expect.objectContaining({ error: testError.message, important: true })
    );
  });

  // ... other tests for different scenarios and edge cases ...
});
```

## Common Issues & Solutions (Summary)

- **Hoisting (`vi.mock`):** Define mocks BEFORE imports. Use factory functions.
- **ESM:** Ensure mocks correctly handle ESM exports/imports.
- **Test Interference:** Reset mocks (`vi.resetAllMocks`, `mockLogger.reset`) in `beforeEach`.
- **Globals (`fetch`, `crypto`):** Use `vi.stubGlobal`.
- **Type Errors:** Use `as unknown as Type` for mocks, `expect.objectContaining<Partial<Interface>>` for assertions.

*(Self-Correction: Integrated key troubleshooting from testing-guide.md)*

## Recent Testing Improvements Summary

*(Consolidated from testing-status.md)*

- Addressed ESM/hoisting issues in several test files.
- Fixed mocking for Supabase, AI SDK, Response objects.
- Improved logger mocking (`mock-logger.ts`).
- Standardized `fetch` mocking using `vi.stubGlobal`.
- Added placeholder for `cache-service.test.ts`.
- Achieved high pass rate on existing tests (needs re-verification after refactor).

*(Self-Correction: Removed specific file names/counts from testing-status as they become outdated quickly. Focused on the *types* of improvements made)*