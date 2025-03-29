# Legacy Scripts

This directory contains legacy test scripts and utilities that have been migrated to the new standardized testing structure.

## Migration Status

These files are kept for reference but should not be used for new tests. All new tests should be created in the `/tests` directory following the standard structure.

## Legacy Files

### Test Utilities

- `env-loader.ts` - Original environment loader (replaced by `/tests/helpers/env-loader.ts`)
- `test-utils.ts` - Original test utilities (replaced by `/tests/helpers/test-utils.ts`)

### Test Scripts

- `env-test.ts` - Tests for environment loading
- `logging.test.ts` - Tests for logging functionality
- `perplexity.test.ts` - Tests for Perplexity API integration
- `perplexity-direct-test.ts` - Tests for direct Perplexity API calls
- `scraper.test.ts` - Tests for web scraper functionality
- `supabase-rpc-test.ts` - Tests for Supabase RPC calls
- `test-admin-status.ts` - Tests for admin status verification

## Migration Process

These scripts have been migrated to the new testing structure in the following ways:

1. Core utilities moved to `/tests/helpers/`
2. Environment handling moved to `/tests/helpers/env-loader.ts`
3. Test runner functionality replaced by Vitest
4. Individual tests moved to appropriate locations in `/tests/unit/` or `/tests/integration/`

## Running Tests

Instead of running these legacy scripts directly, use the new standardized test commands:

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