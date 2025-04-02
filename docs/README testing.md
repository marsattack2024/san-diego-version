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
// Import vi from Vitest first
import { vi } from 'vitest';

// Setup mock implementations BEFORE importing the module under test
vi.mock('@/lib/logger/edge-logger', () => ({
  edgeLogger: mockLogger
}));

// Now you can import the module that uses edgeLogger
import { MyService } from '@/lib/services/my-service';
```

### Important: Understanding vi.mock Hoisting

Vitest automatically hoists `vi.mock()` calls to the top of the file. This means:

1. **Don't use variables defined in the same module scope inside vi.mock**:
   ```typescript
   // ❌ INCORRECT: This will fail because mockValue is hoisted above its declaration
   const mockValue = { data: 'test' };
   vi.mock('@/some-module', () => ({
     someFunction: () => mockValue // Error: Cannot access 'mockValue' before initialization
   }));
   
   // ✅ CORRECT: Define mock values inside the factory function
   vi.mock('@/some-module', () => {
     const localMockValue = { data: 'test' };
     return {
       someFunction: () => localMockValue
     };
   });
   ```

2. **Module mocks must be defined before their imports**:
   ```typescript
   // ✅ CORRECT ORDER:
   import { vi } from 'vitest';
   vi.mock('@/utils/supabase/server');
   
   // Import module under test after mocks are defined
   import { DatabaseService } from '@/services/database';
   ```

3. **Initialization of mock implementation**:
   ```typescript
   // Define mock implementation
   vi.mock('@/utils/supabase/server', () => {
     const mockClient = {
       from: vi.fn().mockReturnThis(),
       select: vi.fn().mockReturnThis()
     };
     
     return {
       createClient: vi.fn().mockResolvedValue(mockClient)
     };
   });
   
   // Import the mocked module to access the mock functions
   import { createClient } from '@/utils/supabase/server';
   
   // Now you can modify the implementation in your test setup
   beforeEach(() => {
     (createClient as unknown as Mock).mockImplementation(() => /* new implementation */);
   });
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
9. ✅ **Title Generation Tests**: Tests for chat title generation and persistence
10. ✅ **Tool Usage Persistence Tests**: Tests for saving tool usage data with messages

### Test Coverage Gaps

The following areas currently lack comprehensive test coverage:

1. ❌ **Zustand Store Tests**: The centralized state management store (`stores/chat-store.ts`) needs tests for:
   - Store actions (createConversation, addMessage, etc.)
   - Optimistic update patterns
   - Error recovery mechanisms
   - Synchronization with backend APIs

2. ❌ **UI Component Tests**: Key UI components like the sidebar-history component require testing:
   - Rendering of conversation history
   - Handling of optimistic updates
   - Interaction with the Zustand store
   - Visibility-based refresh logic

3. ❌ **Chat-History Synchronization Tests**: The synchronization between UI state and database needs tests:
   - History polling mechanism
   - Cache invalidation
   - Error handling in synchronization

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

## Testing Guidelines for Key Features

### 1. Zustand Store Testing Guide (TODO)

This section outlines the recommended approach for implementing tests for the chat store that is currently missing from our test coverage.

#### Test File Structure

Recommended test file: `tests/unit/stores/chat-store.test.ts`

```
tests/
├── unit/
│   ├── stores/
│   │   └── chat-store.test.ts  # Unit tests for the Zustand store
```

#### Mock Requirements

For comprehensive testing of the Zustand store, we need to mock:

1. **History Service**: Mock the fetchHistory API calls
2. **Supabase Client**: Mock database operations for creating/updating conversations
3. **Logger**: Intercept logs to verify correct logging patterns
4. **Local Storage**: Mock for testing persistence functionality

#### Key Test Cases

1. **Core State Management**
   - Test initial state setup
   - Test state updates through actions
   - Verify persistence configuration

2. **Conversation Management**
   - Test creating conversations (optimistic updates)
   - Test deleting conversations
   - Test updating conversation titles
   - Test error recovery mechanisms

3. **History Synchronization**
   - Test fetching history and updating store
   - Test error handling during synchronization
   - Test throttling and caching behavior

4. **Visibility-Based Updates**
   - Test visibility change detection
   - Test polling behavior with different intervals

### 2. UI Component Testing Guide (TODO)

For testing React components that interact with the Zustand store, such as the sidebar-history component:

#### Test File Structure

Recommended test file: `tests/unit/components/sidebar-history.test.tsx`

```
tests/
├── unit/
│   ├── components/
│   │   └── sidebar-history.test.tsx  # Unit tests for the sidebar component
```

#### Test Approach

1. Mock the Zustand store using vi.mock
2. Test rendering with different store states
3. Test interaction handlers
4. Verify proper shallow comparison usage

## Title Generation Service Testing Guide

### Overview

This guide outlines the testing approach for the title generation service, which uses OpenAI to generate contextual titles for chat conversations after the first message exchange. This is an example of well-implemented tests that serve as a model for future test implementations.

### Test File Structure

Test file: `tests/unit/services/title-service.test.ts`

```
tests/
├── unit/
│   ├── services/
│   │   └── title-service.test.ts  # Unit tests for title generation
```

### Mock Requirements

For comprehensive testing of the title generation service, we need to mock:

1. **OpenAI Client**: Mock the chat completions API to return predictable titles
2. **Supabase Client**: Mock database operations for title retrieval and updates
3. **Cache Service**: Mock Redis operations for rate limiting and locking
4. **Logger**: Intercept logs to verify correct logging patterns
5. **Fetch API**: Mock fetch calls for cache invalidation

### Key Test Cases

1. **Core Functionality**
   - Successfully generate and save a title for a new conversation
   - Validate the appropriate system prompt is used for title generation
   - Ensure database update operations occur with the correct parameters

2. **Error Handling**
   - Test behavior when OpenAI API fails (should use fallback title)
   - Test behavior when database operations fail
   - Verify appropriate error logging with correct categories and metadata

3. **Rate Limiting**
   - Verify respecting rate limits when maximum attempts is reached
   - Test that no OpenAI API calls occur when rate limited
   - Confirm appropriate warning logs are generated

4. **Locking Mechanism**
   - Test lock acquisition success path
   - Test behavior when lock acquisition fails (already in progress)
   - Verify lock is released even when errors occur

5. **Existing Title Check**
   - Verify no title generation occurs when a non-default title exists
   - Ensure appropriate logs are created when skipping generation

6. **Performance Testing**
   - Test that title generation completes within acceptable time limits
   - Verify slow operations are properly flagged in logs

### Example Test Implementation

This code pattern follows our established testing practices:

```typescript
// Mock setup BEFORE importing the module under test
setupLoggerMock();

// Mock OpenAI with predictable responses
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Generated Title Example'
              }
            }]
          })
        }
      }
    }))
  };
});

// Mock cache service
vi.mock('@/lib/cache/cache-service', () => {
  return {
    cacheService: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn()
    }
  };
});

// Then import the module
import { generateAndSaveChatTitle } from '@/lib/chat/title-service';

describe('Title Generation Service', () => {
  const chatId = 'test-chat-id';
  const userId = '5c80df74-1e2b-4435-89eb-b61b740120e9';
  const userMessage = 'How do I improve my JavaScript skills?';
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockLogger.reset();
  });
  
  it('should generate a title successfully', async () => {
    // Test implementation...
  });
  
  // Additional tests...
});
```

### Key Test Assertions

Make sure to test these key aspects:

1. **Correct OpenAI Parameters**
   - Verify model selection ('gpt-3.5-turbo')
   - Check system prompt content for title generation guidance
   - Validate user message is passed correctly

2. **Database Interactions**
   - Verify the correct table is accessed ('sd_chat_sessions')
   - Ensure title update uses the generated title
   - Check for appropriate error handling

3. **Logging Verification**
   - Verify all expected log entries with correct categories
   - Check for appropriate log levels based on operation outcome
   - Validate that performance metrics (durationMs) are included
   - Ensure user IDs are properly masked

4. **Redis Lock Management**
   - Verify lock acquisition and release
   - Test proper lock timeout configuration
   - Ensure locks are released in finally blocks

### Setup Helper Functions

The test file should include appropriate setup like:

```typescript
function setupSuccessfulMocks() {
  // Setup successful response paths
  vi.mocked(cacheService.exists).mockResolvedValue(false);
  vi.mocked(cacheService.set).mockResolvedValue('OK');
  
  // Mock database operations
  const mockSupabaseClient = createClient();
  vi.mocked(mockSupabaseClient.from().update).mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null })
  });
}

function setupFailedOpenAIMock() {
  // Configure OpenAI to fail for specific tests
  const openaiInstance = new OpenAI();
  openaiInstance.chat.completions.create = vi.fn().mockRejectedValue(
    new Error('API Error')
  );
}
```

### Common Pitfalls

1. **Order of Mocks**: Always set up mocks before importing the module under test
2. **Missing Reset**: Ensure `vi.clearAllMocks()` and `mockLogger.reset()` are called in `beforeEach`
3. **Incomplete Assertion**: Verify both the result and side effects (logs, database calls)
4. **String vs. Enum**: When checking log categories, use the LOG_CATEGORIES enum values, not string literals
5. **Missing Error Tests**: Include explicit tests for error paths, not just happy paths

By following these guidelines, we ensure comprehensive testing of the title generation service with appropriate coverage of all functionality, error handling, and integration points.