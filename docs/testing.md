# Testing Framework

This document outlines the testing approach for the application, based on our implementation of a standardized testing structure using Vitest.

## Framework Overview

We've selected **Vitest** as our primary testing framework, offering:

- Native ESM support (crucial for our Next.js 15.2 project)
- Fast parallel test execution
- TypeScript integration
- Intuitive mocking capabilities
- Code coverage reporting

## Directory Structure

Tests are organized in a standardized structure that mirrors the source code:

```
tests/
├── unit/                # Unit tests for individual components
│   ├── lib/             # Tests for library code
│   │   └── edge-logger.test.ts  # Tests for edge logger
│   ├── services/        # Tests for services
│   │   ├── document-retrieval.test.ts # Tests for document retrieval
│   │   └── scraper.test.ts # Tests for scraper service
│   └── components/      # Tests for UI components
│
├── integration/         # Integration tests across components
│   ├── api/             # API route tests
│   └── services/        # Service integration tests
│
├── helpers/             # Shared testing utilities
│   ├── env-loader.ts    # Environment variable handling
│   ├── mock-logger.ts   # Mock implementation of the logger
│   ├── mock-clients.ts  # Mock implementations of external services
│   ├── test-utils.ts    # Core testing utilities
│   └── test-data/       # Mock data for tests
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
- Validates required variables and enforces test-specific API keys

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
- Mock date functionality for time-dependent tests
- Retry functionality for testing eventually consistent operations
- Helper functions for common testing patterns

### Test Data (`test-data/mock-data.ts`)

- Predefined data structures for different types of tests
- Mock users, documents, embeddings, and API responses
- Sample data for cache, RAG, web scraping, and other tests
- Reusable error instances for testing error handling

## Global Setup and Test Configuration

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
    
    // Other configuration...
  },
  
  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

Use this global setup sparingly for operations that truly need to happen once before all tests. For most test state initialization, prefer `beforeEach` in the test files themselves.

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

For complex services, we've created custom mock implementations in `mock-clients.ts`:

```typescript
// Example of our Redis mock implementation
export class MockRedisClient {
  private store = new Map<string, any>();
  
  async get(key: string): Promise<any> {
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: any): Promise<string> {
    this.store.set(key, value);
    return 'OK';
  }
  
  // More methods...
}
```

These mocks can be used with `vi.mock()` to replace real implementations:

```typescript
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => mockRedisClient
  }
}));
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
        'Cache get',
        expect.objectContaining({
          category: LOG_CATEGORIES.SYSTEM,
          key
        })
      );
    });
  });
});
```

## Migration Progress

We're in the process of migrating our test suite to the standardized Vitest framework. Here's the current status:

### Completed Migrations

1. ✅ **Document Retrieval Tests**: Comprehensive tests for RAG caching and vector search functionality
   - File: `/tests/unit/services/document-retrieval.test.ts`
   - Coverage: Basic operations, caching, error handling, key generation

2. ✅ **Web Scraper Tests**: Tests for the Puppeteer scraping service
   - File: `/tests/unit/services/scraper.test.ts`
   - Coverage: URL validation, content caching, error handling

3. ✅ **Edge Logger Tests**: Tests for our Edge-compatible logging system
   - File: `/tests/unit/lib/edge-logger.test.ts`
   - Coverage: Log levels, metadata, error formatting, operation tracking, batch logging

4. ✅ **Cache Service Tests**: Unit tests for the Redis cache service implementation
   - File: `/tests/unit/lib/cache/cache-service.test.ts`
   - Coverage: Basic operations, TTL handling, domain-specific methods, key normalization, error handling

### In Progress Migrations

1. 🔄 **Environment Tests**: Testing environment variable loading and validation
   - Legacy File: `/scripts/tests/env-test.ts`
   - Target: `/tests/unit/lib/env-loader.test.ts`

2. 🔄 **Perplexity Service Tests**: Testing the Perplexity API integration
   - Legacy File: `/scripts/tests/perplexity.test.ts`
   - Target: `/tests/unit/services/perplexity.test.ts`

### Still to Migrate

1. ⏳ **API Route Tests**: Testing Next.js API routes
2. ⏳ **Authentication Tests**: Testing auth flow and middleware
3. ⏳ **Vector Service Tests**: Testing vector operations and embeddings

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Dependencies**: Don't make real API calls in tests
3. **Clear Structure**: Use `describe` blocks to group related tests
4. **Descriptive Names**: Test names should clearly describe what's being tested
5. **Focused Assertions**: Each test should verify one specific behavior
6. **Verify Logging**: Check that appropriate messages are logged
7. **Clean Setup/Teardown**: Reset mocks and state before/after tests

## Known Issues & Workarounds

- **Type Issues with LOG_CATEGORIES**: When using the mock logger in tests, you may encounter TypeScript errors about string literals vs the LogCategory type. Use a local constants object with the same values as a workaround.
- **ESM Compatibility**: Some older libraries might have CommonJS compatibility issues. Use dynamic imports or ESM-compatible alternatives when possible.
- **Edge Runtime Testing**: For Edge API routes, ensure mocks are compatible with the Edge runtime restrictions (no Node.js specific APIs).