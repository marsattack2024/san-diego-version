Okay, let's establish a clean, standardized testing pattern for your Next.js project as of Saturday morning in South Miami. It's very common for `scripts` folders to accumulate various things over time, so wanting to structure your actual tests properly is a great idea.

The pattern you're describing – having a central place for common setup, variables, or helpers – is excellent practice. It promotes consistency and reduces boilerplate in your test files.

Given your stack (Next.js 15.2, TypeScript, Supabase, Vercel AI SDK, ESM), here's a proposed structure and plan:

**1. Choose a Test Runner**

You need a standard tool to discover, run, and report on your tests. For a modern Next.js/TypeScript/ESM project, popular choices are:

* **Vitest:** Modern, fast, ESM-first, Jest-compatible API. Generally works well even though Next.js doesn't use Vite internally. Often requires less configuration than Jest for ESM/TS.
* **Jest:** The long-standing standard, very mature. Next.js has built-in configuration support (`next/jest`). Can sometimes require more setup for ESM.

**Recommendation:** **Vitest** is often preferred for new ESM projects due to its speed and simpler configuration, but **Jest** is also a perfectly valid and well-supported choice if you prefer its ecosystem or Next.js's specific Jest integration. *Pick one and stick with it.*

**2. Standardized Folder Structure**

Instead of mixing tests within the `scripts` folder, create a dedicated top-level folder for tests:

```
your-project-root/
├── app/
├── lib/
├── scripts/          <-- Keep OPERATIONAL scripts here (dev, deploy, db setup, etc.)
├── tests/            <-- NEW: All automated tests go here
│   ├── unit/         <-- Unit tests (testing isolated functions/modules)
│   │   ├── lib/
│   │   │   └── cache/
│   │   │       └── cache-service.test.ts
│   │   └── ... (mirror your src structure)
│   ├── integration/  <-- Integration tests (testing modules working together)
│   │   ├── services/
│   │   │   └── document-retrieval.int.test.ts
│   │   └── api/
│   │       └── chat.int.test.ts
│   ├── e2e/          <-- (Optional) End-to-end tests (e.g., using Playwright)
│   ├── setup.ts      <-- Global setup/teardown for the test runner
│   ├── helpers/      <-- Your "core basic file" lives here
│   │   ├── index.ts  <-- Barrel file to export helpers
│   │   ├── mock-data.ts
│   │   ├── mock-clients.ts (e.g., mock Supabase, mock AI SDK)
│   │   └── test-utils.ts (e.g., createTestUser, loadTestEnv)
│   └── fixtures/     <-- (Optional) Larger test data files
├── public/
├── .env.test         <-- Environment variables specifically for tests
├── package.json
├── tsconfig.json
└── vitest.config.ts  <-- OR jest.config.js
```

**3. The "Core Basic File" Pattern (`tests/helpers/`)**

This is where you put your reusable testing logic:

* **`tests/helpers/mock-clients.ts`:** Create mock implementations or use mocking libraries (like `vi.mock` in Vitest or `jest.mock`) for external services:
    * Mock Supabase Client (`createClient`): Return controlled data, check function calls without hitting the actual database.
    * Mock Vercel AI SDK (`streamText`): Return predefined responses or errors.
    * Mock Upstash Redis (`new Redis()`): Use an in-memory map or a mock library.
* **`tests/helpers/test-utils.ts`:** Common utility functions used across tests:
    * Function to load environment variables from `.env.test`.
    * Helper to create mock HTTP requests/responses.
    * Functions to generate common test data objects.
* **`tests/helpers/mock-data.ts`:** Predefined data structures used in multiple tests.
* **`tests/helpers/index.ts`:** Use a barrel file to export everything from the helpers directory for easy importing in tests:
    ```typescript
    // tests/helpers/index.ts
    export * from './mock-clients';
    export * from './test-utils';
    export * from './mock-data';
    ```
* **Usage in Tests:**
    ```typescript
    // tests/unit/lib/cache/cache-service.test.ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { mockRedisClient } from '@/tests/helpers'; // Use alias if configured
    import { CacheService } from '@/lib/cache/cache-service';

    // Mock the Redis dependency BEFORE importing the service
    vi.mock('@upstash/redis', () => ({
      Redis: vi.fn(() => mockRedisClient), // Use your mock client
    }));

    describe('CacheService', () => {
      beforeEach(() => {
        mockRedisClient.flushall(); // Reset mock before each test
      });

      it('should set and get a value', async () => {
        // ... test using CacheService, which now uses mockRedisClient
      });
    });
    ```

**4. Test Runner Configuration**

* Create a config file (e.g., `vitest.config.ts`).
* Configure aliases (e.g., `@/*` pointing to `src/*` or `lib/*`) to match your `tsconfig.json` for easier imports.
* Set up test environment (e.g., `jsdom`, `node`).
* Point to global setup files if needed (e.g., `tests/setup.ts` for code that runs once before all tests).
* Define test file patterns (e.g., `tests/**/*.test.ts`).

**5. Migrating Your Current Files**

1.  **Install Test Runner:** `npm install -D vitest @vitest/ui` (or `jest`). Add test scripts to `package.json`.
2.  **Set up Config:** Create `vitest.config.ts` (or `jest.config.js`).
3.  **Create `tests/` structure:** Create the `tests/` folder and subfolders (`unit`, `integration`, `helpers`).
4.  **Identify & Move Helpers:** Move relevant code from `scripts/lib/test-utils.ts` and `scripts/lib/env-loader.ts` into the new `tests/helpers/` structure. Adapt them as needed.
5.  **Identify & Move Tests:** Go through `scripts/tests/` and potentially the root `scripts/` (like `test-admin-status.ts`). Move actual test files into `tests/unit/` or `tests/integration/`, renaming them to `*.test.ts`.
6.  **Refactor Tests:** Rewrite the tests using the chosen runner's API (`describe`, `it`, `expect`, `vi`/`jest` for mocking). Update imports to use the new helpers from `tests/helpers/`.
7.  **Clean Up `scripts/`:** Keep only the necessary operational scripts (like `dev.js`, `deploy-vercel.js`, `setup-supabase.js`). Delete the old test files (`scripts/tests/*`), old helpers (`scripts/lib/*`), and any other obsolete scripts. Update `scripts/README.md` to reflect the remaining scripts.

This approach provides a standard, maintainable structure that separates tests from operational scripts and allows for efficient reuse of testing logic.