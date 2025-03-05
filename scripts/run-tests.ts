#!/usr/bin/env node

// Import environment variables first - this must be the first import
import './lib/env-loader';

import { runTests } from './lib/test-utils';
import { edgeLogger } from '../lib/logger/edge-logger';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Import test suites
import { tests as embeddingsTests } from './tests/embeddings.test';
import { tests as documentSearchTests } from './tests/document-search.test';
import { tests as loggingTests } from './tests/logging.test';
import { tests as perplexityTests } from './tests/perplexity.test';
import { tests as scraperTests } from './tests/scraper.test';

const logger = edgeLogger;

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define test suite type
type TestCase = {
  name: string;
  fn: () => Promise<void>;
};

// Define all available test suites with proper typing
const TEST_SUITES: Record<string, TestCase[]> = {
  'embeddings': embeddingsTests,
  'document-search': documentSearchTests,
  'logging': loggingTests,
  'perplexity': perplexityTests,
  'scraper': scraperTests,
  // Add more test suites here as they are created
};

/**
 * Parses command line arguments to determine which tests to run
 * 
 * @returns Array of test names to run, or empty array for all tests
 */
function parseArgs(): string[] {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npx tsx scripts/run-tests.ts [test-suite-1] [test-suite-2] ...');
    console.log('\nAvailable test suites:');
    Object.keys(TEST_SUITES).forEach(suite => console.log(`  - ${suite}`));
    console.log('\nOptions:');
    console.log('  --help, -h     Show this help message');
    console.log('  --list, -l     List all available test suites');
    console.log('\nExamples:');
    console.log('  npx tsx scripts/run-tests.ts                  # Run all tests');
    console.log('  npx tsx scripts/run-tests.ts embeddings       # Run only embeddings tests');
    process.exit(0);
  }
  
  // Check for list flag
  if (args.includes('--list') || args.includes('-l')) {
    console.log('Available test suites:');
    Object.keys(TEST_SUITES).forEach(suite => console.log(`  - ${suite}`));
    process.exit(0);
  }
  
  // Return specified test suites or empty array for all
  return args.filter(arg => !arg.startsWith('-'));
}

/**
 * Main function to run tests
 */
async function main(): Promise<void> {
  logger.info('Starting test runner...', { important: true });
  
  // Parse command line arguments
  const requestedSuites = parseArgs();
  
  // Determine which test suites to run
  const suitesToRun = requestedSuites.length > 0
    ? requestedSuites.filter(suite => suite in TEST_SUITES)
    : Object.keys(TEST_SUITES);
  
  if (requestedSuites.length > 0) {
    const invalidSuites = requestedSuites.filter(suite => !(suite in TEST_SUITES));
    if (invalidSuites.length > 0) {
      logger.warn(`Unknown test suites: ${invalidSuites.join(', ')}`, { important: true });
    }
  }
  
  logger.info(`Running test suites: ${suitesToRun.join(', ')}`, { important: true });
  
  // Collect all tests to run
  const allTests: TestCase[] = [];
  for (const suite of suitesToRun) {
    const tests = TEST_SUITES[suite];
    for (const test of tests) {
      allTests.push({
        name: `${suite}: ${test.name}`,
        fn: test.fn
      });
    }
  }
  
  // Run all tests
  await runTests(allTests);
}

// Run the main function
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    logger.error('Test execution failed:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      important: true
    });
    process.exit(1);
  });
} 