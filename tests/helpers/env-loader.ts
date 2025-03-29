/**
 * Environment Variable Loader for Testing
 * 
 * This module handles loading environment variables for tests, providing fallbacks
 * and consistent access to configuration values.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load test environment variables
function loadTestEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');
  
  // Try to load .env.test if it exists
  const testEnvPath = path.join(rootDir, '.env.test');
  if (fs.existsSync(testEnvPath)) {
    dotenv.config({ path: testEnvPath });
  } else {
    // Fall back to .env
    dotenv.config({ path: path.join(rootDir, '.env') });
  }
  
  // Set NODE_ENV for testing if not already set - using workaround to avoid read-only property error
  if (!process.env.NODE_ENV) {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
      enumerable: true
    });
  }
  
  // Set TEST_LOG_LEVEL if not specified (keep test output clean by default)
  if (!process.env.TEST_LOG_LEVEL) {
    process.env.TEST_LOG_LEVEL = 'error';
  }
}

// Call loadTestEnv immediately to ensure environment is set up
loadTestEnv();

/**
 * Test Environment Configuration
 * 
 * This object provides typed access to all environment variables used in tests,
 * with fallbacks for required values.
 */
export const testEnv = {
  // Node environment
  NODE_ENV: process.env.NODE_ENV as string,
  
  // Log level specific to tests
  TEST_LOG_LEVEL: process.env.TEST_LOG_LEVEL as string,
  
  // Database connection
  POSTGRES_URL: process.env.POSTGRES_URL as string,
  
  // Supabase connection
  SUPABASE_URL: process.env.SUPABASE_URL as string,
  SUPABASE_KEY: process.env.SUPABASE_KEY as string,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  
  // Redis cache
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL as string,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  
  // OpenAI API
  OPENAI_API_KEY: process.env.OPENAI_API_KEY as string,
  
  // Perplexity AI
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY as string,
  
  // Test-specific settings with defaults
  TEST_TIMEOUT: parseInt(process.env.TEST_TIMEOUT || '10000', 10),
  SKIP_SLOW_TESTS: process.env.SKIP_SLOW_TESTS === 'true',
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || 'test@example.com',
  
  // Helper methods
  isTestEnv: () => process.env.NODE_ENV === 'test',
  isDevelopment: () => process.env.NODE_ENV === 'development',
  isProduction: () => process.env.NODE_ENV === 'production'
};

/**
 * Validate that required test environment variables are available
 * @returns Array of missing variables
 */
export function validateTestEnv() {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN'
  ];
  
  return requiredVars.filter(varName => !process.env[varName]);
}

/**
 * Get a test API key, using a test-specific key if available
 * or falling back to the production key with a warning
 */
export function getTestApiKey(service: 'openai' | 'perplexity') {
  const testKey = process.env[`TEST_${service.toUpperCase()}_API_KEY`];
  const prodKey = process.env[`${service.toUpperCase()}_API_KEY`];
  
  if (testKey) {
    return testKey;
  }
  
  if (!prodKey) {
    throw new Error(`No API key available for ${service}`);
  }
  
  // Log warning if using production key in tests
  console.warn(`Warning: Using production ${service} key for tests. Consider setting TEST_${service.toUpperCase()}_API_KEY`);
  
  return prodKey;
} 