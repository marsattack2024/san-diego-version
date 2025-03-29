/**
 * Core Testing Utilities
 * 
 * This module provides shared utilities and helpers for testing across the application.
 * It includes functions for setup, teardown, and running tests with consistent logging.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Use the edge logger for test output
const logger = edgeLogger;

/**
 * Test case interface representing a single test
 */
export interface TestCase {
  name: string;
  fn: () => Promise<void>;
  only?: boolean;
  skip?: boolean;
}

/**
 * Global setup function to initialize shared resources before running tests
 */
export async function globalSetup(): Promise<void> {
  logger.info('Global test setup: Initializing test environment...', { 
    category: LOG_CATEGORIES.SYSTEM,
    important: true 
  });
  
  // Initialize shared resources, database connections, etc.
  
  logger.info('Global test setup complete');
}

/**
 * Global teardown function to clean up resources after tests complete
 */
export async function globalTeardown(): Promise<void> {
  logger.info('Global test teardown: Cleaning up resources...', { 
    category: LOG_CATEGORIES.SYSTEM,
    important: true 
  });
  
  // Clean up shared resources, close connections, etc.
  
  logger.info('Global test teardown complete');
}

/**
 * Run a single test with proper logging and error handling
 * 
 * @param testName - Name of the test
 * @param testFn - Test function to execute
 * @returns Promise that resolves when the test completes
 */
export async function runTest(
  testName: string,
  testFn: () => Promise<void>
): Promise<boolean> {
  logger.info(`🧪 Starting Test: ${testName}`, { 
    category: LOG_CATEGORIES.SYSTEM,
    important: true 
  });
  
  const startTime = Date.now();
  
  try {
    await testFn();
    const duration = Date.now() - startTime;
    
    logger.info(`✅ Test passed: ${testName} (${duration}ms)`, { 
      category: LOG_CATEGORIES.SYSTEM,
      important: true 
    });
    
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`❌ Test failed: ${testName} (${duration}ms)`, {
      category: LOG_CATEGORIES.SYSTEM,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      important: true
    });
    
    return false;
  }
}

/**
 * Run a collection of tests with proper setup and teardown
 * 
 * @param tests - Array of test cases to run
 * @param options - Test run options
 * @returns Promise that resolves when all tests complete
 */
export async function runTests(
  tests: TestCase[],
  options: {
    skipSetup?: boolean;
    skipTeardown?: boolean;
    failFast?: boolean;
  } = {}
): Promise<{ passed: number; failed: number; skipped: number; }> {
  const {
    skipSetup = false,
    skipTeardown = false,
    failFast = false
  } = options;
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failedTests: string[] = [];
  
  try {
    // Run global setup
    if (!skipSetup) {
      await globalSetup();
    }
    
    // Filter tests if there are any marked as "only"
    const onlyTests = tests.filter(test => test.only);
    const testsToRun = onlyTests.length > 0 ? onlyTests : tests;
    
    // Run each test
    for (const test of testsToRun) {
      if (test.skip) {
        logger.info(`⏭️ Skipping test: ${test.name}`, { 
          category: LOG_CATEGORIES.SYSTEM 
        });
        skipped++;
        continue;
      }
      
      const testPassed = await runTest(test.name, test.fn);
      
      if (testPassed) {
        passed++;
      } else {
        failed++;
        failedTests.push(test.name);
        
        // Break early if failFast is enabled
        if (failFast && failed > 0) {
          logger.warn('Stopping test run due to failFast option', { 
            category: LOG_CATEGORIES.SYSTEM 
          });
          break;
        }
      }
    }
    
    // Log test summary
    logger.info('📊 Test Results Summary', { 
      category: LOG_CATEGORIES.SYSTEM,
      important: true 
    });
    
    logger.info(`Total: ${testsToRun.length}, Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`, { 
      category: LOG_CATEGORIES.SYSTEM,
      important: true 
    });
    
    if (failed > 0) {
      logger.error(`Failed tests: ${failedTests.join(', ')}`, { 
        category: LOG_CATEGORIES.SYSTEM,
        important: true 
      });
    }
  } finally {
    // Always run teardown unless explicitly skipped
    if (!skipTeardown) {
      await globalTeardown();
    }
  }
  
  return { passed, failed, skipped };
}

/**
 * Assert a condition with a custom error message
 * A simple assertion utility for use in tests
 * 
 * @param condition - Condition to check
 * @param message - Error message to throw if condition is false
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Sleep for a specified number of milliseconds
 * Useful for testing asynchronous processes
 * 
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock implementation of the current date for testing time-dependent logic
 * This is a simpler implementation that just mocks Date.now()
 * 
 * @param mockDate - Date to use as "now"
 * @returns Function to restore the original Date.now
 */
export function mockDate(mockDate: Date): () => void {
  const originalNow = Date.now;
  
  // Only override the Date.now method
  Date.now = () => mockDate.getTime();
  
  // Return function to restore original Date.now
  return () => {
    Date.now = originalNow;
  };
} 