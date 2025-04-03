# Test Mocking Cheatsheet

This document provides ready-to-use patterns for mocking common dependencies in the test suite.

## Table of Contents

1. [Vitest Basics](#vitest-basics)
2. [Mocking Modules](#mocking-modules)
3. [Mocking ESM Modules](#mocking-esm-modules)
4. [Mocking Supabase](#mocking-supabase)
5. [Mocking Redis](#mocking-redis)
6. [Mocking Fetch API](#mocking-fetch-api)
7. [Mocking Vercel AI SDK](#mocking-vercel-ai-sdk)
8. [Mocking Logger](#mocking-logger)
9. [Mocking Response Objects](#mocking-response-objects)
10. [Handling Type Safety](#handling-type-safety)

## Vitest Basics

### Setting Up Tests

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('Component Name', () => {
  beforeEach(() => {
    // Setup code
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Cleanup code
  });

  it('should do something specific', () => {
    // Test code
    expect(result).toBe(expectedValue);
  });
});
```

### Creating Spies

```typescript
// Spy on existing function
const functionSpy = vi.spyOn(object, 'method');

// Create a standalone spy
const spy = vi.fn();
```

## Mocking Modules

### Basic Module Mocking

```typescript
vi.mock('@/lib/module-name', () => ({
  functionName: vi.fn(),
  ClassName: vi.fn().mockImplementation(() => ({
    method1: vi.fn(),
    method2: vi.fn()
  }))
}));
```

### Auto Mocking with Partial Implementation

```typescript
vi.mock('@/lib/module-name', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    functionToOverride: vi.fn()
  };
});
```

## Mocking ESM Modules

### Handling Hoisting Issues

```typescript
// 1. Define mocks BEFORE importing modules that use them
vi.mock('@/lib/module-name', () => ({
  functionName: vi.fn()
}));

// 2. Only after all mocks are set up, import the module under test
import { functionName } from '@/lib/module-name';
```

### Factory Functions for ESM Mocks

```typescript
vi.mock('@/lib/module-name', () => {
  // Create local variables here that won't be affected by hoisting
  const mockData = new Map();
  
  return {
    functionName: vi.fn().mockImplementation(() => {
      // Can safely use mockData here
      return mockData.get('key');
    })
  };
});
```

## Mocking Supabase

### Basic Supabase Client Mock

```typescript
// Define the mock Supabase client with chainable methods
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(), 
  eq: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: { title: 'Test' }, error: null })
};

// Mock the createClient function
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

// Use with type assertion when needed
import { createClient } from '@/utils/supabase/server';
const client = createClient() as unknown as SupabaseClient;
```

### Supabase Client with Conditional Results

```typescript
// Mock with conditional behavior
const mockSupabase = {
  from: vi.fn().mockImplementation((table) => {
    if (table === 'error_table') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } })
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: { id: '123', title: 'Test' }, error: null })
    };
  })
};
```

## Mocking Redis

### In-Memory Redis Mock

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

### Simpler Redis Mock for Quick Tests

```typescript
vi.mock('@upstash/redis', () => {
  return {
    Redis: {
      fromEnv: vi.fn(() => ({
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue(null),
        del: vi.fn().mockResolvedValue(1),
        flushall: vi.fn().mockResolvedValue('OK'),
        exists: vi.fn().mockResolvedValue(0)
      }))
    }
  };
});
```

## Mocking Fetch API

### Global Fetch Mock

```typescript
// Setup before tests
beforeEach(() => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve('success')
  });
  vi.stubGlobal('fetch', mockFetch);
});

// Clean up after tests
afterEach(() => {
  vi.unstubAllGlobals();
});

// In your test
it('should call fetch with correct parameters', async () => {
  await functionThatUsesFetch();
  expect(fetch).toHaveBeenCalledWith(
    'https://api.example.com',
    expect.objectContaining({ 
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' })
    })
  );
});
```

### Fetch with Conditional Responses

```typescript
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
    if (url.includes('success')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: 'success' }),
        text: () => Promise.resolve('success')
      });
    } else if (url.includes('error')) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
        text: () => Promise.resolve('Internal server error')
      });
    } else {
      return Promise.resolve({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('No content')),
        text: () => Promise.resolve('')
      });
    }
  }));
});
```

## Mocking Vercel AI SDK

### AI Module Mock

```typescript
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

### AI Module with Tool Calling

```typescript
vi.mock('ai', () => {
  const mockToolCall = {
    id: 'tool-call-123',
    name: 'mock_tool',
    args: { query: 'test query' }
  };

  const mockResponse = {
    text: '',
    toolCalls: [mockToolCall],
    toDataStreamResponse: vi.fn().mockImplementation(() => new Response('{}')),
    consumeStream: vi.fn()
  };

  return {
    streamText: vi.fn().mockResolvedValue(mockResponse),
    StringOutputParser: vi.fn().mockImplementation(() => ({
      toDataStreamResponse: vi.fn().mockReturnValue(new Response('{}'))
    })),
    tool: vi.fn().mockImplementation((config) => ({
      type: 'function',
      name: config.name,
      description: config.description,
      parameters: config.parameters,
      execute: config.execute
    }))
  };
});
```

## Mocking Logger

### Basic Logger Mock

```typescript
vi.mock('@/lib/logger/edge-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));
```

### Comprehensive Logger Mock

```typescript
// Create a helper file for logger mocking
// @/tests/helpers/mock-logger.ts

import { vi } from 'vitest';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Create a mock logger that tracks calls
export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  
  // Helper methods
  reset() {
    this.info.mockReset();
    this.warn.mockReset();
    this.error.mockReset();
    this.debug.mockReset();
  },
  
  // Find logs matching criteria
  hasLogsMatching(level, criteria) {
    const method = this[level];
    return method.mock.calls.some(call => {
      const [message, context] = call;
      return Object.entries(criteria).every(([key, value]) => {
        if (key === 'message') {
          return message.includes(value);
        }
        return context[key] === value;
      });
    });
  }
};

// Setup function to mock the logger module
export function setupLoggerMock() {
  vi.mock('@/lib/logger/edge-logger', () => ({
    logger: mockLogger,
    LOG_CATEGORIES: LOG_CATEGORIES,
    LOG_LEVELS: {
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
      DEBUG: 'debug'
    },
    THRESHOLDS: {
      DOCUMENT_SIZE: 10000,
      TOKEN_COUNT: 8000
    }
  }));
  
  // Also mock specific loggers
  vi.mock('@/lib/logger/title-logger', () => ({
    titleLogger: {
      attemptGeneration: vi.fn(),
      titleGenerated: vi.fn(),
      titleGenerationFailed: vi.fn(),
      titleUpdateResult: vi.fn(),
      rateLimitExceeded: vi.fn(),
      lockAcquisitionFailed: vi.fn(),
      titleExists: vi.fn(),
      cacheResult: vi.fn()
    }
  }));
}
```

## Mocking Response Objects

### Response Object for Route Handlers

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

### Creating Response Objects Directly

```typescript
// Simple JSON response
const mockResponse = new Response(JSON.stringify({ success: true }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

// Response with custom methods
const mockResponseWithMethods = {
  ...new Response('Test response'),
  json: vi.fn().mockResolvedValue({ data: 'test data' }),
  text: vi.fn().mockResolvedValue('Test text content'),
  headers: new Headers({ 'Content-Type': 'text/plain' }),
  status: 200,
  ok: true
};
```

## Handling Type Safety

### Type Assertions for Mocks

```typescript
// Cast mock to interface
const mockClient = mockSupabase as unknown as SupabaseClient;

// Type-safe function mock
const typedMock = vi.fn<[string, number], boolean>();

// Properly typing complex mocks
interface MockedRedisClient {
  set: (key: string, value: any, options?: { ex?: number }) => Promise<string>;
  get: (key: string) => Promise<any>;
  del: (key: string) => Promise<number>;
}

const mockRedisClient = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1)
} as MockedRedisClient;
```

### Strongly Typed Object Matching

```typescript
// Type-safe object matching in expect statements
expect(logger.info).toHaveBeenCalledWith(
  expect.any(String),
  expect.objectContaining<Partial<LogContext>>({
    category: LOG_CATEGORIES.SYSTEM,
    userId: 'test-user'
  })
);

// Using TypeScript generics with expect.objectContaining
interface LogParams {
  chatId: string;
  userId: string;
  durationMs: number;
  success: boolean;
}

expect(titleLogger.titleUpdateResult).toHaveBeenCalledWith(
  expect.objectContaining<Partial<LogParams>>({
    chatId: 'test-chat-id',
    userId: 'test-user',
    success: true
  })
);
```

## Common Testing Patterns

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  // Arrange
  const mockData = { id: '123', name: 'Test' };
  vi.mocked(apiClient.getData).mockResolvedValue(mockData);
  
  // Act
  const result = await serviceUnderTest.processData('123');
  
  // Assert
  expect(apiClient.getData).toHaveBeenCalledWith('123');
  expect(result).toEqual(expect.objectContaining({
    id: '123',
    processed: true
  }));
});
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  // Arrange
  const error = new Error('API error');
  vi.mocked(apiClient.getData).mockRejectedValue(error);
  
  // Act
  const result = await serviceUnderTest.processData('123');
  
  // Assert
  expect(apiClient.getData).toHaveBeenCalledWith('123');
  expect(result).toEqual({ error: 'API error', success: false });
  expect(logger.error).toHaveBeenCalledWith(
    expect.stringContaining('Failed to process data'),
    expect.objectContaining({
      error: 'API error'
    })
  );
});
```

### Testing with Timers

```typescript
it('should handle timeouts', async () => {
  // Setup fake timers
  vi.useFakeTimers();
  
  // Start async operation that involves timers
  const promise = serviceUnderTest.operationWithTimeout();
  
  // Fast-forward time
  vi.advanceTimersByTime(5000);
  
  // Await the result
  const result = await promise;
  
  // Verify the result
  expect(result).toBe('timeout');
  
  // Restore real timers
  vi.useRealTimers();
});
```

## Best Practices

1. Always reset mocks in beforeEach to ensure test isolation
2. Use factory functions in vi.mock to avoid hoisting issues
3. Mock only what's necessary - try to use real implementations where feasible
4. Be explicit about return types and parameters in mocks
5. Use named parameters in mock implementations for clarity
6. Prefer small, focused tests over large, complex ones
7. Set up all mocks before importing the module under test
8. Use object destructuring to make test setup more readable
9. Consider creating helper functions for complex mock setup
10. Document any non-obvious mocking patterns 