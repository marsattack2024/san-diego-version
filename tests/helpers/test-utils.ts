/**
 * Core Testing Utilities
 * 
 * This module provides shared utilities and helpers for testing across the application.
 * It includes functions for setup, teardown, and running tests with consistent logging.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { vi, afterEach } from 'vitest';

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
 * Useful for testing timeouts and TTLs
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random string of specified length
 * Useful for creating unique test IDs
 */
export function randomString(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => 
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

/**
 * Create a mock date that can be restored later
 * @param mockDate The date to set as current
 * @returns Function to restore the original Date
 */
export function mockDate(mockDate: Date): () => void {
  const RealDate = global.Date;
  
  // A simpler implementation that just mocks Date.now
  const originalNow = Date.now;
  Date.now = () => mockDate.getTime();
  
  // Return function to restore real Date
  return () => {
    Date.now = originalNow;
  };
}

/**
 * Utility to retry a function until it succeeds or times out
 * Useful for testing eventually consistent systems
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const { 
    maxRetries = 3, 
    delay = 100, 
    shouldRetry = () => true 
  } = options;
  
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error)) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Create a temporary object that will be automatically cleaned up
 * after the test completes
 */
export function createTemp<T>(value: T, cleanup: (value: T) => Promise<void> | void): T {
  // Register cleanup to run after the test
  afterEach(async () => {
    await cleanup(value);
  });
  
  return value;
}

/**
 * Check if a test should be skipped based on environment variables
 * Useful for conditionally skipping slow or external tests
 */
export function shouldSkipTest(type: 'slow' | 'external' | 'flaky'): boolean {
  switch (type) {
    case 'slow':
      return process.env.SKIP_SLOW_TESTS === 'true';
    case 'external':
      return process.env.SKIP_EXTERNAL_TESTS === 'true';
    case 'flaky':
      return process.env.SKIP_FLAKY_TESTS === 'true';
    default:
      return false;
  }
} 