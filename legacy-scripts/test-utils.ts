import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { edgeLogger } from '../../lib/logger/edge-logger';

const logger = edgeLogger;

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * globalSetup()
 * Initializes shared resources before running tests.
 */
export async function globalSetup(): Promise<void> {
  logger.info('Global setup: Initializing resources...', { important: true });
  // Initialize shared resources (e.g., database connections) here.
  logger.info('Global setup complete.');
}

/**
 * globalTeardown()
 * Cleans up shared resources after tests complete.
 */
export async function globalTeardown(): Promise<void> {
  logger.info('Global teardown: Cleaning up resources...', { important: true });
  // Clean up shared resources here.
  logger.info('Global teardown complete.');
}

/**
 * runTest()
 * A helper function that wraps individual tests for consistent logging and error handling.
 */
export async function runTest(
  testName: string,
  testFn: () => Promise<void>
): Promise<void> {
  logger.info(`\n=== Starting Test: ${testName} ===\n`, { important: true });
  const startTime = Date.now();
  
  try {
    await testFn();
    const duration = Date.now() - startTime;
    logger.info(`✓ Test "${testName}" passed! (${duration}ms)`, { important: true });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`✗ Test "${testName}" failed (${duration}ms)`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      important: true
    });
    throw error;
  }
}

/**
 * runTests()
 * Runs a collection of tests with proper setup and teardown.
 */
export async function runTests(
  tests: Array<{ name: string; fn: () => Promise<void> }>
): Promise<void> {
  try {
    await globalSetup();
    
    let passed = 0;
    let failed = 0;
    const failedTests: string[] = [];
    
    for (const test of tests) {
      try {
        await runTest(test.name, test.fn);
        passed++;
      } catch (error) {
        failed++;
        failedTests.push(test.name);
      }
    }
    
    logger.info('\n=== Test Summary ===', { important: true });
    logger.info(`Total: ${tests.length}, Passed: ${passed}, Failed: ${failed}`, { important: true });
    
    if (failed > 0) {
      logger.error(`Failed tests: ${failedTests.join(', ')}`, { important: true });
    }
  } finally {
    await globalTeardown();
  }
} 