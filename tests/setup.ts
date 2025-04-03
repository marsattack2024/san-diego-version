/**
 * Global Test Setup
 * 
 * This file runs once before all tests start, setting up the test environment
 * and initializing shared resources for testing.
 */

// Load environment variables first
import { testEnv } from './helpers/env-loader';
import { globalSetup, globalTeardown } from './helpers/test-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { vi } from 'vitest'; // Import vi

// --- Global Mocks --- 
// Mock Supabase server client globally to prevent React cache errors in Node env
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    // Provide a minimal mock structure if needed by other modules during import
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }
  })
}));

// Configure the logger for tests
edgeLogger.info('Configuring test environment...', {
  category: LOG_CATEGORIES.SYSTEM
});

// Set mock date for consistent timestamp-based tests if needed
// const restoreDate = mockDate(new Date('2023-01-01T00:00:00Z'));

/**
 * Setup function that runs before all tests
 */
export async function setup() {
  // Log startup
  edgeLogger.info('Starting test setup...', {
    category: LOG_CATEGORIES.SYSTEM,
    nodeEnv: process.env.NODE_ENV,
  });

  // Log environment variables being used
  edgeLogger.info('Test environment variables configured', {
    category: LOG_CATEGORIES.SYSTEM,
    supabaseConfigured: !!testEnv.SUPABASE_URL,
    openaiConfigured: !!testEnv.OPENAI_API_KEY
  });

  // Run global setup
  await globalSetup();

  // Return teardown function
  return async () => {
    await globalTeardown();

    // Restore any global mocks
    // restoreDate();

    edgeLogger.info('Test teardown completed', {
      category: LOG_CATEGORIES.SYSTEM
    });
  };
}

// Export the setup function as default for test runners
export default setup; 