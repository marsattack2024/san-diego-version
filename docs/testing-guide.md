# Testing Guide for San Diego

This guide provides best practices and patterns for writing tests in the San Diego codebase. Following these guidelines will help ensure tests are robust, maintainable, and correctly validate the behavior of our components.

## Common Testing Issues and Solutions

### 1. AI Module Mocking

**Issue**: The `ai` package uses ESM and has specific module structures that make it challenging to mock with Vitest.

**Solution**: Create a complete mock implementation that includes all necessary methods:

```typescript
// Mock the AI module and streamText function
vi.mock('ai', () => {
  // Create a response structure similar to what streamText would return
  const mockResponse = {
    text: 'Mock response text',
    toolCalls: [],
    toDataStreamResponse: vi.fn().mockImplementation(() => new Response('{}')),
    consumeStream: vi.fn()
  };

  // Mock the streamText function
  const streamTextMock = vi.fn().mockResolvedValue(mockResponse);

  // Mock the tool function
  const toolMock = vi.fn().mockImplementation((config) => {
    return {
      type: 'function',
      name: config.name || 'mock_tool',
      description: config.description || 'Mock tool description',
      parameters: config.parameters || {},
      execute: config.execute || (() => Promise.resolve('Mock tool response'))
    };
  });

  return {
    streamText: streamTextMock,
    StringOutputParser: vi.fn().mockImplementation(() => ({
      toDataStreamResponse: vi.fn().mockReturnValue(new Response('{}'))
    })),
    tool: toolMock
  };
});
```

### 2. Response Object Mocking

**Issue**: Route handlers return Response objects that need proper status codes and methods.

**Solution**: Create complete Response objects with all required methods:

```typescript
vi.mock('@/lib/utils/route-handler', () => ({
  successResponse: vi.fn((data) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })),
  errorResponse: vi.fn((message, error, status = 500) => new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })),
  unauthorizedError: vi.fn(() => new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  }))
}));
```

### 3. Fetch API Mocking

**Issue**: Global fetch needs proper stubbing with response methods.

**Solution**: Use vi.stubGlobal with complete response implementations:

```typescript
beforeEach(() => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve('success')
  });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals(); // Clean up stubbed fetch
});
```

### 4. Redis Mocking

**Issue**: Redis operations need to be properly mocked with an in-memory implementation.

**Solution**: Create a complete mock implementation with in-memory storage:

```typescript
vi.mock('@upstash/redis', () => {
  // In-memory storage for mocking Redis
  const mockStore = new Map<string, any>();
  const mockExpirations = new Map<string, number>();

  return {
    Redis: {
      fromEnv: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((key: string, value: any, options?: { ex?: number }) => {
          mockStore.set(key, value);
          if (options?.ex) {
            mockExpirations.set(key, Date.now() + (options.ex * 1000));
          }
          return Promise.resolve('OK');
        }),
        get: vi.fn().mockImplementation((key: string) => {
          const expiry = mockExpirations.get(key);
          if (expiry && expiry < Date.now()) {
            mockStore.delete(key);
            mockExpirations.delete(key);
            return Promise.resolve(null);
          }
          return Promise.resolve(mockStore.get(key) || null);
        }),
        del: vi.fn().mockImplementation((key: string) => {
          const existed = mockStore.has(key);
          mockStore.delete(key);
          mockExpirations.delete(key);
          return Promise.resolve(existed ? 1 : 0);
        }),
        flushall: vi.fn().mockImplementation(() => {
          mockStore.clear();
          mockExpirations.clear();
          return Promise.resolve('OK');
        })
      })
    }
  };
});
```

### 5. Logger Mocking

**Issue**: Logger needs to include all methods and constants that are imported by tested modules.

**Solution**: Extend the mock logger to include all necessary properties:

```typescript
// In tests/helpers/mock-logger.ts
export const THRESHOLDS = {
  RAG_TIMEOUT: 5000,
  API_TIMEOUT: 10000,
  SLOW_THRESHOLD_MS: 2000,
  VERY_SLOW_THRESHOLD_MS: 5000,
  MAX_LOG_SIZE: 10000,
  MAX_MESSAGE_COUNT_FOR_TITLE: 5,
  PERPLEXITY_TIMEOUT: 20000
};

// Set up function to mock the logger
export const setupLoggerMock = () => {
  // Mock the edge-logger module
  vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: mockLogger,
    THRESHOLDS // Include the thresholds in the mock
  }));

  // Mock the logger module
  vi.mock('@/lib/logger', () => ({
    logger: mockLogger
  }));

  // Reset mock call history
  mockLogger.reset();

  return mockLogger;
};
```

### 6. Hoisting Issues

**Issue**: Vitest hoists mock declarations to the top of the module, before imports, which can cause problems with circular dependencies.

**Solution**: Use factory functions and put everything inside the mock function:

```typescript
// BAD - importing a module that you're trying to mock
import { someUtility } from '@/lib/utils';

vi.mock('@/lib/utils', () => ({
  someUtility: vi.fn() // Will not work correctly due to hoisting
}));

// GOOD - using factory function and defining everything inside
vi.mock('@/lib/utils', () => {
  // Local implementations that don't depend on the module itself
  const mockUtility = vi.fn().mockImplementation(() => 'mocked result');
  
  return {
    someUtility: mockUtility
  };
});
```

## Best Practices

### 1. Set Up Mocks Before Importing

Always set up mocks before importing the modules that use them:

```typescript
// 1. Import test utilities
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setupLoggerMock } from '@/tests/helpers/mock-logger';

// 2. Set up mocks
setupLoggerMock();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    // Mock implementation
  })
}));

// 3. NOW import the modules that use the mocked dependencies
import { myFunction } from '@/lib/my-module';
```

### 2. Reset Mocks Between Tests

Reset all mocks in beforeEach to ensure tests don't affect each other:

```typescript
beforeEach(() => {
  vi.resetAllMocks();
  mockLogger.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});
```

### 3. Mock Environment Variables

Use vi.stubEnv to mock environment variables:

```typescript
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-supabase-url.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});
```

### 4. Use Object Matching for Complex Assertions

Use expect.objectContaining for flexible assertions:

```typescript
expect(mockLogger.info).toHaveBeenCalledWith(
  'Chat engine facade initialized',
  expect.objectContaining({
    useDeepSearch: true,
    operation: 'test_operation'
  })
);
```

### 5. Test Error Handling

Always include tests for error cases:

```typescript
it('should handle errors gracefully', async () => {
  // Arrange - mock a failure
  mockFunction.mockRejectedValue(new Error('Test error'));
  
  // Act - function should not throw
  const result = await functionUnderTest();
  
  // Assert - should return a default/fallback value
  expect(result).toEqual(defaultValue);
  
  // Verify error was logged
  expect(mockLogger.error).toHaveBeenCalledWith(
    expect.stringContaining('Error occurred'),
    expect.objectContaining({
      error: expect.any(Error)
    })
  );
});
```

## Testing Patterns

### 1. Integration Testing Approach

For integration tests, mock external dependencies but use real internal services:

```typescript
describe('Integration: ChatEngine with real services', () => {
  beforeEach(() => {
    // Mock external APIs and databases
    vi.mock('@/lib/external-api', () => ({
      callExternalApi: vi.fn().mockResolvedValue({ success: true })
    }));
    
    // But use real internal services
    // DO NOT mock these:
    // - ChatContextService
    // - MessageProcessingService
    // etc.
  });
  
  it('should process a request through multiple services', async () => {
    // Create real instances of services
    const contextService = new ChatContextService();
    const processingService = new MessageProcessingService();
    
    // Test with real service composition
    // ...
  });
});
```

### 2. Unit Testing Approach

For unit tests, mock all dependencies:

```typescript
describe('Unit: ChatContextService', () => {
  beforeEach(() => {
    // Mock ALL dependencies
    vi.mock('@/lib/message-persistence.service', () => ({
      getRecentMessages: vi.fn().mockResolvedValue([])
    }));
    
    vi.mock('@/lib/utils/context-builder', () => ({
      buildSystemContext: vi.fn().mockReturnValue({})
    }));
  });
  
  it('should correctly build context from a request', async () => {
    // Create service with mocked dependencies
    const service = new ChatContextService();
    
    // Test in isolation
    // ...
  });
});
```

## Testing Techniques

### 1. Testing Asynchronous Code

Use async/await for testing asynchronous code:

```typescript
it('should process asynchronous operations', async () => {
  // Arrange
  const mockPromise = Promise.resolve('result');
  
  // Act
  const result = await asyncFunction();
  
  // Assert
  expect(result).toBe('result');
});
```

### 2. Testing Timeouts and Delays

Use Vitest's fake timers for testing code with timeouts:

```typescript
it('should handle timeouts', async () => {
  // Setup fake timers
  vi.useFakeTimers();
  
  // Start the operation that includes setTimeout
  const promise = functionWithTimeout();
  
  // Advance timers
  vi.advanceTimersByTime(1000);
  
  // Wait for the promise
  const result = await promise;
  
  // Restore real timers
  vi.useRealTimers();
  
  // Assert
  expect(result).toBe('timeout result');
});
```

## Conclusion

Following these patterns and best practices will help create robust, maintainable tests that correctly validate the behavior of the San Diego codebase. Remember that tests should be:

1. **Fast**: Tests should run quickly to enable rapid iteration.
2. **Isolated**: Tests should not depend on each other or external state.
3. **Repeatable**: Tests should produce the same results each time they run.
4. **Self-validating**: Tests should automatically determine if they pass or fail.
5. **Thorough**: Tests should cover all significant code paths and edge cases.

By adhering to these principles, we can ensure that our test suite provides valuable protection against regressions as we evolve the codebase. 