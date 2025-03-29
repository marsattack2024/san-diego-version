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
│   └── test-utils.ts    # Core testing utilities
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
  expect.stringContaining('Cache hit'),
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
        expect.stringContaining('Cache hit'),
        expect.objectContaining({
          category: LOG_CATEGORIES.CACHE,
          key
        })
      );
    });
  });
});
```

## Next Steps

The testing framework implementation is now complete. Here are the next steps:

1. **Fix Linter Errors in Mock-Clients.ts**:
   - Fix the Redis category type issue to use the proper LOG_CATEGORIES enum
   - Resolve the mockResolvedValue implementation issue

2. **Complete Test-Utils.ts Implementation**:
   - Add utilities for test timeouts and retries
   - Implement common test data generators

3. **Migrate Legacy Tests**:
   - Convert existing tests from `/legacy-scripts/` to the new format
   - Update imports to use the new helpers

4. **Add More Tests**:
   - Create integration tests for API routes
   - Add unit tests for key services (perplexity, RAG, etc.)
   - Add tests for UI components

5. **CI Integration**:
   - Update CI pipeline to run tests
   - Configure test reporting and coverage thresholds

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Dependencies**: Don't make real API calls in tests
3. **Clear Structure**: Use `describe` blocks to group related tests
4. **Descriptive Names**: Test names should clearly describe what's being tested
5. **Focused Assertions**: Each test should verify one specific behavior
6. **Verify Logging**: Check that appropriate messages are logged
7. **Clean Setup/Teardown**: Reset mocks and state before/after tests