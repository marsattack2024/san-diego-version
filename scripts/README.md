# Scripts Directory

This directory contains utility scripts for the AI Chat Interface project.

## Active Scripts

- `dev.js` - Development script for running the application
- `update-imports.js` - Updates import statements to be ESM-compatible
- `setup-supabase.js` - Script for setting up Supabase
- `deploy-vercel.js` - Script for deploying to Vercel
- `check-env.ts` - Validates environment variables
- `cleanup-unused-assets.mjs` - Cleans up unused assets
- `load-env.ts` - Loads environment variables
- `run-tests.ts` - Main entry point to run all tests
- `setup-env.ts` - Sets up environment variables
- `test-admin-status.ts` - Tests admin status
- `test-agent-router.mjs` - Tests agent router
- `test-chat-tools.ts` - Tests chat tools
- `test-document-search.ts` - Tests document search
- `test-embeddings.ts` - Tests embeddings

## Setup Scripts

`setup/setup-first-admin.js` - Creates the first admin user for the application

## Test Scripts

The test directory contains scripts for testing various components of the application.

## Testing Framework Structure

```
/scripts
  /lib                   # Shared testing utilities
    /test-utils.ts       # Core testing utilities (runTest, setup, teardown)
    /env-loader.ts       # Environment variable management
  /tests                 # Individual test files
    /embeddings.test.ts  # Embeddings tests
    /document-search.test.ts # Document search tests
    /logging.test.ts     # Logging system tests
    /perplexity.test.ts  # Perplexity API tests
    /scraper.test.ts     # Web scraper tests
  /run-tests.ts          # Main entry point to run all tests
```

## Running Tests

You can run tests using the `tsx` runtime for TypeScript:

```bash
# Run all tests
npx tsx scripts/run-tests.ts

# Run specific test suites
npx tsx scripts/run-tests.ts embeddings document-search logging perplexity scraper

# Show help
npx tsx scripts/run-tests.ts --help

# List available test suites
npx tsx scripts/run-tests.ts --list
```

You can also run individual test files directly:

```bash
# Run embeddings tests
npx tsx scripts/tests/embeddings.test.ts

# Run document search tests
npx tsx scripts/tests/document-search.test.ts
```

## Environment Variables

Tests require certain environment variables to be set. These can be provided in a `.env` file in the project root. If variables are missing, the test framework will use placeholder values for testing purposes.

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Creating New Tests

To create a new test suite:

1. Create a new file in the `scripts/tests` directory with a `.test.ts` extension
2. Import the environment loader and test utilities:

```typescript
// Import environment variables first
import { env } from '../lib/env-loader';
import { runTest, runTests } from '../lib/test-utils';
import { fileURLToPath } from 'url';

// Import the modules you want to test
import { yourFunction } from '../../lib/your-module';

// Define your test functions
async function testYourFunction(): Promise<void> {
  // Your test code here
}

// Main function to run all tests in this suite
async function main(): Promise<void> {
  await runTests([
    { name: 'Your Test Name', fn: testYourFunction }
  ]);
}

// Run the tests if this module is being executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

// Export the tests for use in other test runners
export const tests = [
  { name: 'Your Test Name', fn: testYourFunction }
];
```

3. Add your test suite to the `TEST_SUITES` object in `scripts/run-tests.ts`:

```typescript
// Import your new test suite
import { tests as yourTests } from './tests/your-test.test';

const TEST_SUITES: Record<string, TestCase[]> = {
  'embeddings': embeddingsTests,
  'document-search': documentSearchTests,
  'your-test': yourTests,  // Add your new test suite here
};
```

## Test Utilities

The testing framework provides several utilities to help with writing tests:

- `runTest(name, fn)`: Runs a single test with proper logging and error handling
- `runTests(tests)`: Runs a collection of tests with setup and teardown
- `globalSetup()`: Initializes shared resources before running tests
- `globalTeardown()`: Cleans up shared resources after tests complete
- `loadEnvironment(options)`: Loads and validates environment variables

## Best Practices

1. Keep tests focused on a single functionality
2. Use descriptive test names
3. Include proper validation in your tests
4. Handle errors gracefully
5. Clean up any resources created during tests

## Available Test Suites

### Embeddings Tests
Tests the creation and management of vector embeddings using OpenAI's API and Supabase Vector.

### Document Search Tests
Tests the document search functionality using vector similarity search.

### Logging Tests
Tests the application's logging system, including:
- Server-side logging with different log levels
- Vector operation logging
- Structured logging

### Perplexity API Tests
Tests the integration with Perplexity's AI API:
- Regular (non-streaming) API calls
- Streaming API calls

### Web Scraper Tests
Tests the web scraping functionality:
- Single URL scraping
- Multiple URL scraping
- Content extraction and processing 