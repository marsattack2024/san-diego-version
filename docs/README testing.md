# Testing Framework

This document outlines our standardized testing approach using Vitest for the San Diego application.

## Framework Overview

We use **Vitest** as our primary testing framework, which offers:

- Native ESM support (crucial for our Next.js project)
- Fast parallel test execution
- TypeScript integration
- Intuitive mocking capabilities
- Code coverage reporting

## Directory Structure

The actual test structure is organized to mirror the source code:

```
tests/
├── helpers/             # Shared testing utilities
│   ├── env-loader.ts    # Environment variable handling
│   ├── mock-logger.ts   # Mock implementation of the logger
│   ├── mock-clients.ts  # Mock implementations of external services
│   ├── test-utils.ts    # Core testing utilities
│   └── test-data/       # Mock data for tests
│       └── mock-data.ts # Predefined test data
│
├── unit/                # Unit tests for individual components
│   ├── lib/             # Tests for library code
│   │   ├── cache/       # Cache-related tests
│   │   │   └── cache-service.test.ts # Tests for cache service
│   │   └── edge-logger.test.ts # Tests for edge logger
│   ├── services/        # Tests for services
│   │   ├── document-retrieval.test.ts # Tests for document retrieval
│   │   ├── perplexity.test.ts # Tests for Perplexity API
│   │   ├── scraper.test.ts # Tests for scraper service
│   │   └── supabase-rpc.test.ts # Tests for Supabase RPC functions
│   ├── components/      # Tests for UI components
│   └── chat-engine/     # Tests for chat engine components
│       ├── deep-search.test.ts # Tests for deep search tool
│       └── web-scraper.test.ts # Tests for web scraper
│
├── integration/         # Integration tests across components
│   ├── api/             # API route tests
│   └── services/        # Service integration tests
│
├── setup.ts             # Global setup/teardown for all tests
└── README.md            # Test documentation
```

## Core Testing Utilities

The `tests/helpers/` directory contains reusable testing utilities:

### Environment Management (`env-loader.ts`)

- Automatically loads environment variables from `.env.test`, falling back to `.env`
- Sets a default log level of `error` for tests to keep output clean
- Provides typed access to all environment variables with defaults
- Handles validation for required testing variables
- Example usage:

```typescript
import { testEnv } from '@/tests/helpers/env-loader';

// Access typed environment variables
const supabaseUrl = testEnv.SUPABASE_URL;
const isTestEnv = testEnv.isTestEnv();
```

### Logger Mocking (`mock-logger.ts`) 

- Mocks the logger to prevent console clutter during test runs
- Captures log messages for verification in tests
- Provides helper methods for asserting log messages, categories, and importance
- Proper setup requires:

```typescript
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Setup mocks BEFORE importing modules that use logging
setupLoggerMock();

// Now import the module under test
import { MyService } from '@/lib/services/my-service';
```

### External Service Mocks (`mock-clients.ts`)

- Mock implementations of Redis, Supabase, OpenAI, and AI SDK
- In-memory Redis implementation for testing cache operations
- Supabase client with mock auth, database, and storage methods
- AI client mocks with controllable responses and streaming

### Test Utilities (`test-utils.ts`)

- Timing utilities like `sleep()` for testing TTLs and async operations
- Helper functions for common testing patterns
- Global setup and teardown functions

## Global Setup and Configuration

The `tests/setup.ts` file provides global configuration that runs once before all tests:

```typescript
// In setup.ts
import { testEnv } from './helpers/env-loader';
import { globalSetup, globalTeardown } from './helpers/test-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export async function setup() {
  // Log startup
  edgeLogger.info('Starting test setup...', {
    category: LOG_CATEGORIES.SYSTEM,
    nodeEnv: process.env.NODE_ENV,
  });
  
  // Run global setup
  await globalSetup();
  
  // Return teardown function
  return async () => {
    await globalTeardown();
  };
}

export default setup;
```

This setup is properly configured in `vitest.config.ts`:

```typescript
// In vitest.config.ts
export default defineConfig({
  test: {
    // Global test setup
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    include: ['./tests/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 10000,
    clearMocks: true
  },
  
  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

## Mocking Approach

Our testing framework uses Vitest's mocking capabilities extensively:

### Module Mocking

For mocking entire modules, use `vi.mock()` before importing the module:

```typescript
// Mock the entire module
vi.mock('@/lib/logger/edge-logger', () => ({
  edgeLogger: mockLogger
}));

// Now you can import the module that uses edgeLogger
import { MyService } from '@/lib/services/my-service';
```

### Function Mocking

For individual functions, use `vi.fn()` to create mock functions:

```typescript
// Create a spy that tracks calls
const mockFetch = vi.fn();

// Configure behavior
mockFetch.mockResolvedValue({ json: () => Promise.resolve({ data: 'test' }) });

// Verify calls
expect(mockFetch).toHaveBeenCalledWith('/api/endpoint', { method: 'GET' });
```

### Class and Method Mocking

For class methods, use `vi.spyOn()`:

```typescript
// Spy on a method
const getSpy = vi.spyOn(cacheService, 'get');

// Configure behavior
getSpy.mockResolvedValue({ cached: true });

// Restore original when done
getSpy.mockRestore();
```

### Custom Mock Implementations

For complex services, we create custom mock implementations in `mock-clients.ts`. For example, our Redis mock:

```typescript
// Example of our Redis mock implementation
vi.mock('@upstash/redis', () => {
  const mockStore = new Map<string, any>();
  
  return {
    Redis: {
      fromEnv: () => ({
        get: vi.fn().mockImplementation(async (key: string) => {
          return mockStore.get(key) || null;
        }),
        
        set: vi.fn().mockImplementation(async (key: string, value: any) => {
          mockStore.set(key, value);
          return 'OK';
        }),
        
        // More methods...
      })
    }
  };
});
```

## Logging Standards in Tests

To ensure clean test output and proper verification of logging:

### 1. Control Log Output

- **Mock the Logger**: Always use our `mock-logger.ts` implementation
- **Reset Between Tests**: Clear the logger state in `beforeEach`
- **Set Log Level**: Tests default to ERROR level; override with `TEST_LOG_LEVEL` env var

### 2. Test Logging Behavior

Verify that code logs correctly using the mock logger:

```typescript
// Verify a debug message was logged with specific category
expect(mockLogger.debug).toHaveBeenCalledWith(
  'Cache hit',
  expect.objectContaining({
    category: LOG_CATEGORIES.CACHE,
    key: 'test-key'
  })
);

// Check for logs with a specific category
expect(mockLogger.hasLogWithCategory('error', LOG_CATEGORIES.CACHE)).toBe(true);

// Get and verify important logs
const importantLogs = mockLogger.getImportantLogs();
expect(importantLogs.length).toBeGreaterThan(0);
```

### 3. Follow Log Format Standards

When logging in application code (which will be tested), follow these guidelines:

- **Use Categories**: Always include the appropriate `LOG_CATEGORIES` constant
- **Structure Messages**: Begin with an action verb, keep concise
- **Use Metadata**: Put variable data in metadata rather than message strings
- **Mark Important Logs**: Use `important: true` for critical issues
- **Include Errors**: Add error objects directly in error logs

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Example Test Pattern

Here's an example of a typical test file structure:

```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks before importing modules that use them
setupLoggerMock();

// Import the code to test
import { CacheService } from '@/lib/cache/cache-service';

describe('CacheService', () => {
  let cacheService: CacheService;
  
  beforeEach(async () => {
    // Reset the logger mock to start fresh
    mockLogger.reset();
    
    // Initialize the service
    cacheService = new CacheService();
  });
  
  describe('#get', () => {
    it('should return cached value when available', async () => {
      // Arrange
      const key = 'test-key';
      const value = { data: 'test' };
      await cacheService.set(key, value);
      
      // Act
      const result = await cacheService.get(key);
      
      // Assert
      expect(result).toEqual(value);
      
      // Verify logging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache get'),
        expect.objectContaining({
          category: LOG_CATEGORIES.CACHE,
          key
        })
      );
    });
  });
});
```

## Current Test Coverage

Based on our examination of the codebase, we have tests for:

1. ✅ **Document Retrieval Tests**: Tests for RAG caching and vector search
2. ✅ **Web Scraper Tests**: Tests for the Puppeteer scraping service
3. ✅ **Edge Logger Tests**: Tests for our logging system
4. ✅ **Cache Service Tests**: Tests for the Redis cache service
5. ✅ **Environment Tests**: Tests for environment variable loading
6. ✅ **Perplexity Service Tests**: Tests for the Perplexity API integration
7. ✅ **Deep Search Tool Tests**: Tests for the deep search tool
8. ✅ **Supabase RPC Tests**: Tests for Supabase RPC function calls

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on side effects
2. **Mock External Dependencies**: Don't make real API calls in tests
3. **Clear Structure**: Use `describe` blocks to group related tests
4. **Descriptive Names**: Test names should clearly describe what's being tested
5. **Focused Assertions**: Each test should verify one specific behavior
6. **Verify Logging**: Check that appropriate messages are logged
7. **Clean Setup/Teardown**: Reset mocks and state before/after tests
8. **Environment Variables**: Test both presence and absence of critical environment variables
   - Use `vi.stubEnv()` instead of modifying `process.env` directly
   - Use `vi.resetModules()` to ensure clean environment between tests
   - Test validation logic for missing critical variables
   - Verify behavior with type conversion (strings to numbers/booleans)

## Known Issues & Workarounds

- **Type Issues with LOG_CATEGORIES**: When using the mock logger in tests, you may encounter TypeScript errors about string literals vs the LogCategory type. Use a local constants object with the same values as a workaround.
- **ESM Compatibility**: Some older libraries might have CommonJS compatibility issues. Use dynamic imports or ESM-compatible alternatives when possible.
- **Edge Runtime Testing**: For Edge API routes, ensure mocks are compatible with the Edge runtime restrictions (no Node.js specific APIs).