# Testing Standards

This document outlines the testing standards and best practices for the application, with special focus on logging and test output readability.

## Testing Framework

The application uses Vitest as the primary testing framework, which offers:

- Native ESM support
- Fast parallel test execution
- TypeScript integration
- Intuitive mocking capabilities
- Snapshot testing
- Code coverage reporting

## Test Structure

### Directory Organization

Tests are organized to mirror the source code structure:

```
tests/
├── unit/                # Unit tests for individual components
│   ├── lib/             # Tests for library code
│   └── components/      # Tests for UI components
├── integration/         # Integration tests across components
├── helpers/             # Shared testing utilities
└── setup.ts             # Global setup/teardown
```

### Test File Naming

- Test files should be named `*.test.ts` or `*.test.tsx` for React components
- Tests should be placed in a directory structure that mirrors the source code

## Logging in Tests

### Controlling Log Output

To ensure clean test output and proper verification of logging behavior:

1. **Mock the Logger**: Always use the mock logger implementation provided in `tests/helpers/mock-logger.ts`:

```typescript
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mock logger before importing modules that use logging
setupLoggerMock();

// Now import the module under test
import { MyService } from '@/lib/services/my-service';
```

2. **Reset Before Each Test**: Reset the logger state in test setup:

```typescript
beforeEach(() => {
  mockLogger.reset();
});
```

3. **Set Test Log Level**: The test environment automatically sets the default log level to `error` to prevent unnecessary console output. This can be overridden by setting the `TEST_LOG_LEVEL` environment variable.

### Testing Logging Behavior

When testing that a component logs appropriately:

1. **Verify Log Messages**:

```typescript
// Check that a debug message was logged
expect(mockLogger.debug).toHaveBeenCalledWith(
  expect.stringContaining('Processing item'),
  expect.objectContaining({
    category: LOG_CATEGORIES.SYSTEM
  })
);

// Check for exact call count
expect(mockLogger.info).toHaveBeenCalledTimes(1);
```

2. **Verify Log Categories**:

```typescript
// Check if any log with a specific category was created
expect(mockLogger.hasLogWithCategory('error', LOG_CATEGORIES.CACHE)).toBe(true);

// Get and inspect all logs for a specific category
const cacheLogs = mockLogger.getLogsByCategory(LOG_CATEGORIES.CACHE);
expect(cacheLogs.length).toBe(2);
```

3. **Verify Important Logs**:

```typescript
// Get all logs marked as important
const importantLogs = mockLogger.getImportantLogs();
expect(importantLogs.some(log => 
  log.message.includes('critical operation') && 
  log.level === 'error'
)).toBe(true);
```

### Log Format Standards

When logging in application code (which will be tested), follow these guidelines:

1. **Always Provide a Category**:
   - Use constants from `LOG_CATEGORIES`
   - Be specific about the subsystem

2. **Structure Log Messages**:
   - Begin with an action verb (e.g., "Processing", "Failed", "Completed")
   - Keep messages concise but descriptive
   - Don't include variable data in message strings, use metadata instead

3. **Use Metadata Effectively**:
   - Include relevant contextual data as metadata
   - Mark truly important logs with `important: true`
   - Include error objects directly for error logs

## Writing Testable Code

To ensure code is easily testable, especially regarding logging:

1. **Dependency Injection**:
   - Allow logger instances to be injected (with defaults)
   - Separate business logic from side effects

2. **Modular Design**:
   - Keep functions small and focused
   - Separate concerns (e.g., logic, logging, external calls)

3. **Error Boundaries**:
   - Implement clear error handling patterns
   - Log errors with appropriate context
   - Ensure errors are logged once at the appropriate level

## Integration with CI/CD

Tests are automatically run in the CI/CD pipeline:

1. **Fail Fast**:
   - Tests should fail immediately on critical issues
   - Use `it.fails` for known failures being addressed

2. **Keep Test Output Clean**:
   - Avoid console.log in tests and tested code
   - Use the mock logger for all logging
   - Use appropriate log levels for different types of information

3. **Coverage Requirements**:
   - Aim for 80%+ coverage for critical code paths
   - All logging code should be exercised in tests

## Test Reporting

When tests complete, they produce reports that should be clear and actionable:

1. **Readable Output**:
   - Test descriptions should form readable sentences
   - Failures should clearly indicate what went wrong

2. **Coverage Reports**:
   - HTML coverage reports are generated with `npm run test:coverage`
   - These highlight areas needing more testing

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/) (for UI components)
- [Mock Service Worker](https://mswjs.io/) (for API testing) 