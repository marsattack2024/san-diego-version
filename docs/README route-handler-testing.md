# Testing Next.js Route Handlers

This document outlines best practices for testing Next.js route handlers using Vitest, specifically in the context of the Edge Runtime and API routes.

## Core Principles

When testing Next.js route handlers, especially those using the Edge Runtime, follow these key principles:

1. **Proper Dependency Mocking**: Mock all external dependencies before importing the route handler
2. **Hoisting Awareness**: Account for Vitest's hoisting behavior with `vi.mock()` calls
3. **Request/Response Testing**: Test both the request parsing and response formatting
4. **Error Handling Verification**: Ensure error cases are properly handled
5. **Environment Isolation**: Avoid relying on actual environment variables or external services

## Common Testing Challenges

### Hoisting Issues

Vitest automatically hoists `vi.mock()` calls to the top of the file, which can lead to reference errors if variables are used within the mock factory function. To avoid this:

```typescript
// ❌ INCORRECT: Will cause "Cannot access 'mockHandler' before initialization"
const mockHandler = vi.fn();
vi.mock('@/lib/services/handler', () => ({
  handler: mockHandler // Error: mockHandler is not defined yet
}));

// ✅ CORRECT: Define everything inside the factory function
vi.mock('@/lib/services/handler', () => ({
  handler: vi.fn() // Creates a new mock function inside the factory
}));

// Then use the imported mock
import { handler } from '@/lib/services/handler';
vi.mocked(handler).mockImplementation(() => {
  // Custom implementation
});
```

### Cookie and Cache Issues

Next.js route handlers often use `cookies()` or `cache()` functions, which can be challenging to mock:

```typescript
// Mock the cache function from next/cache
vi.mock('next/cache', () => ({
  cache: (fn: (...args: any[]) => any) => fn // Pass through function without caching
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null)
  })
}));
```

### Supabase Client Mocking

For routes that use Supabase:

```typescript
// Mock the Supabase client
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis()
  })
}));
```

## Step-by-Step Testing Approach

Follow this sequence for reliable route handler tests:

1. **Set up logger mocking first**:
   ```typescript
   import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
   
   // Setup mocks BEFORE importing modules that use them
   setupLoggerMock();
   ```

2. **Mock dependencies before importing the route handler**:
   ```typescript
   // Mock all dependencies
   vi.mock('@/lib/logger/constants', () => ({
     LOG_CATEGORIES: {
       SYSTEM: 'system',
       CHAT: 'chat',
       TOOLS: 'tools'
     }
   }));
   
   vi.mock('@/lib/utils/http-utils', () => ({
     handleCors: vi.fn((response) => response)
   }));
   
   // More mocks for other dependencies...
   ```

3. **Import the route handler after all mocks are set up**:
   ```typescript
   // Only import after all mocks are configured
   import { POST, OPTIONS } from '@/app/api/route';
   ```

4. **Set up test suite with proper cleanup**:
   ```typescript
   describe('Route Handler Tests', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockLogger.reset();
       // Reset any additional mocks
     });
     
     // Tests go here...
   });
   ```

5. **Test HTTP methods separately**:
   ```typescript
   it('should handle GET requests correctly', async () => {
     // Test implementation
   });
   
   it('should handle POST requests correctly', async () => {
     // Test implementation
   });
   ```

## Example: Testing Widget Chat Route

Here's a complete example of testing the `/api/widget-chat` route handler:

```typescript
/**
 * Widget Chat Route Handler Tests
 * 
 * Tests the functionality of the widget chat API endpoint.
 * Focusing on the core validation and request handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { z } from 'zod';

// Setup mocks BEFORE importing modules that use them
setupLoggerMock();

// Mock dependencies - using factory functions to avoid hoisting issues
vi.mock('@/lib/logger/constants', () => ({
    LOG_CATEGORIES: {
        SYSTEM: 'system',
        CHAT: 'chat',
        TOOLS: 'tools'
    }
}));

vi.mock('@/lib/utils/http-utils', () => ({
    handleCors: vi.fn((response) => response)
}));

vi.mock('@/lib/utils/route-handler', () => ({
    validationError: vi.fn((message) => new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    })),
    errorResponse: vi.fn((message) => new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    }))
}));

// Mock the chat engine facade
const mockHandleRequest = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }))
);

vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn().mockImplementation((config) => ({
        config,
        handleRequest: mockHandleRequest
    }))
}));

// Mock the Supabase client so we don't get cache errors
vi.mock('next/cache', () => ({
    // Use explicit function type to avoid the implicit any error
    cache: (fn: (...args: any[]) => any) => fn
}));

vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn().mockResolvedValue({
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
        }
    })
}));

// Now import required modules
import { handleCors } from '@/lib/utils/http-utils';
import { validationError, errorResponse } from '@/lib/utils/route-handler';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';

// Simple test that verifies the widget chat route validation and error handling
describe('Widget Chat Route Validation', () => {
    // Set up the same schema that's used in the route
    const widgetRequestSchema = z.object({
        message: z.string().optional(),
        messages: z.array(z.object({
            role: z.enum(['user', 'assistant', 'system', 'tool', 'function']),
            content: z.string().or(z.record(z.any())).or(z.null()),
            id: z.string().optional()
        })).optional(),
        sessionId: z.string().uuid()
    }).refine(data =>
        (!!data.message || (Array.isArray(data.messages) && data.messages.length > 0)),
        { message: "Either message or messages must be provided" }
    );

    beforeEach(() => {
        vi.clearAllMocks();
        mockLogger.reset();
        vi.mocked(createChatEngine).mockClear();
        mockHandleRequest.mockClear();
    });

    it('should handle OPTIONS requests with CORS headers', async () => {
        // Import only the OPTIONS handler - must be inside the test to ensure mocks are applied first
        const { OPTIONS } = await import('@/app/api/widget-chat/route');
        
        // Create a mock request
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'OPTIONS'
        });
        
        // Call the handler
        const response = await OPTIONS(req);
        
        // Verify the response
        expect(response.status).toBe(204);
        expect(handleCors).toHaveBeenCalledWith(
            expect.any(Response),
            req,
            true
        );
    });
    
    it('should use gpt-4o-mini model for the widget', async () => {
        // Import the POST handler inside the test to ensure mocks are applied
        const { POST } = await import('@/app/api/widget-chat/route');
        
        // Create a valid request
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Hello from widget',
                sessionId: '123e4567-e89b-12d3-a456-426614174000'
            })
        });
        
        // Call the handler
        await POST(req);
        
        // Verify that createChatEngine was called with gpt-4o-mini model
        expect(createChatEngine).toHaveBeenCalledTimes(1);
        expect(createChatEngine).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-4o-mini',
                maxTokens: 800,
                temperature: 0.4
            })
        );
    });
});
```

## Key Patterns to Note

### 1. Dynamic Import Inside Test

For complicated route handlers, use dynamic imports inside each test case to ensure mocks are applied correctly:

```typescript
it('should handle GET requests correctly', async () => {
  // Import the handler inside the test to ensure mocks are applied
  const { GET } = await import('@/app/api/route');
  
  // Test implementation
});
```

### 2. Request Construction

Use the standard `Request` constructor to create test requests:

```typescript
const req = new Request('https://example.com/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'value'
  })
});
```

### 3. Response Processing

Extract and verify response data:

```typescript
const response = await POST(req);
expect(response.status).toBe(200);

const data = await response.json();
expect(data).toEqual(expect.objectContaining({
  success: true
}));
```

### 4. Mock Verification

Verify that your mocks were called correctly:

```typescript
expect(createChatEngine).toHaveBeenCalledWith(
  expect.objectContaining({
    model: 'gpt-4o-mini'
  })
);

expect(mockLogger.info).toHaveBeenCalledWith(
  expect.stringContaining('Request received'),
  expect.objectContaining({
    category: LOG_CATEGORIES.SYSTEM
  })
);
```

## Common Pitfalls to Avoid

1. **Importing Before Mocking**: Always set up mocks before importing the module under test
2. **Using Variables in Mock Factory**: Don't use variables defined in the test file within the `vi.mock()` factory function
3. **Missing Mock Resets**: Always reset mocks in `beforeEach` to avoid test interdependencies
4. **Not Testing Error Cases**: Include tests for error scenarios, not just happy paths
5. **Environment Leakage**: Don't rely on actual environment variables; mock them explicitly

## Debugging Test Failures

When tests fail, use these approaches to diagnose issues:

1. **Inspect Mock Calls**: Use `console.log(vi.mocked(func).mock.calls)` to see what values were passed
2. **Check Logger Output**: Review `mockLogger` calls to understand execution flow
3. **Partial Implementation**: Start with simpler test cases before attempting complex ones
4. **Sequential Testing**: Test core functionality first before moving to edge cases

## Best Practices Summary

1. **Organize Mocks**: Group related mocks together at the top of the file
2. **Type Safety**: Use proper TypeScript typing for all mocks and assertions
3. **Focused Tests**: Each test should verify one specific behavior
4. **Clear Structure**: Use descriptive test names and follow the Arrange-Act-Assert pattern
5. **Minimal Dependencies**: Mock only what's needed for the specific test
6. **Import Order**: Logger mock first, then dependencies, then route handler last
7. **Clean Setup/Teardown**: Always reset state between tests

By following these guidelines, we can effectively test Next.js route handlers, including those using Edge Runtime, and ensure they behave as expected in all scenarios. 