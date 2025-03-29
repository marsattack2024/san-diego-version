# Testing Framework

This directory contains the testing framework for the application. It uses Vitest for a modern, ESM-native testing experience.

## Directory Structure

```
tests/
├── helpers/             # Shared testing utilities
│   ├── env-loader.ts    # Environment variable handling
│   ├── mock-logger.ts   # Mock implementation of the logger
│   ├── mock-clients.ts  # Mock implementations of external services
│   └── test-utils.ts    # Core testing utilities
│
├── unit/                # Unit tests for individual components
│   ├── lib/             # Tests for library code
│   └── components/      # Tests for UI components
│
├── integration/         # Integration tests across components
│   ├── api/             # API route tests
│   └── services/        # Service integration tests
│
├── setup.ts             # Global setup/teardown for all tests
└── README.md            # Test documentation (this file)
```

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

## Writing Tests

Tests follow a standard structure:

```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest';
// Import utilities and mocks
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Setup mocks before importing modules that use them
setupLoggerMock();

// Import the code to test
import { MyService } from '@/lib/services/my-service';

describe('MyService', () => {
  let service: MyService;
  
  beforeEach(() => {
    // Reset mocks
    mockLogger.reset();
    
    // Initialize component
    service = new MyService();
  });
  
  describe('#methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test input';
      
      // Act
      const result = service.methodName(input);
      
      // Assert
      expect(result).toBe('expected output');
      
      // Verify logging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('operation succeeded'),
        expect.objectContaining({
          category: 'my-service'
        })
      );
    });
  });
});
```

## Test Environment

The test environment is configured to:

1. **Load environment variables** from `.env.test` if available, falling back to `.env`
2. **Mock external services** to avoid making real API calls in tests
3. **Control logging** to keep test output clean and focused
4. **Provide helper utilities** for common test operations

## Logging in Tests

Tests use a mock implementation of the logger to:

1. Prevent console clutter during test runs
2. Allow verification of logging behavior
3. Test error handling paths

Example of testing logging:

```typescript
// Verify that an error was logged with the correct category
expect(mockLogger.error).toHaveBeenCalledWith(
  expect.any(String),
  expect.objectContaining({
    category: 'cache',
    error: expect.any(Error)
  })
);

// Check for logs with a specific category
expect(mockLogger.hasLogWithCategory('info', 'system')).toBe(true);

// Get all important logs
const importantLogs = mockLogger.getImportantLogs();
expect(importantLogs.length).toBeGreaterThan(0);
```

## Mocking External Services

The `mock-clients.ts` module provides mock implementations of:

- Redis client
- Supabase client
- OpenAI client
- AI SDK utilities

These mocks can be used to simulate various conditions without making real API calls.

## Best Practices

1. **Test isolation**: Each test should be independent and not rely on state from other tests
2. **Mock external dependencies**: Don't make real API calls in tests
3. **Clear structure**: Use `describe` blocks to group related tests
4. **Descriptive names**: Test names should clearly describe what's being tested
5. **Focused assertions**: Each test should verify one specific behavior
6. **Verify logging**: Check that appropriate messages are logged
7. **Clean setup/teardown**: Reset mocks and state before/after tests 