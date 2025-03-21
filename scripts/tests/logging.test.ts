// Import environment variables first - this must be the first import
import '../lib/env-loader';

import { runTest, runTests } from '../lib/test-utils';
import { fileURLToPath } from 'url';
import { edgeLogger } from '../../lib/logger/edge-logger';
import vectorLogger from '../../lib/logger/vector-logger';

// Mock browser environment for client logger tests if needed
const mockBrowserEnv = () => {
  (global as any).window = {
    location: { href: 'http://localhost:3000/test' },
    addEventListener: (event: string, handler: any) => console.log(`Added ${event} listener`),
    localStorage: {
      getItem: (key: string) => key === 'chat_user_id' ? 'test-user-123' : null,
      setItem: (key: string, value: string) => console.log(`Set localStorage ${key}=${value}`)
    }
  };
};

/**
 * Test for server-side logging
 */
async function testServerLogging(): Promise<void> {
  console.log('\n--- Testing Server Logger ---');
  
  // Create a logger instance
  const logger = edgeLogger;
  
  // Test different log levels
  logger.debug('This is a debug message', { source: 'test-script' });
  logger.info('This is an info message', { source: 'test-script', important: true });
  logger.warn('This is a warning message', { source: 'test-script' });
  logger.error('This is an error message', { 
    source: 'test-script', 
    error: new Error('Test error'),
    important: true
  });
  
  // Test structured logging
  logger.info('User logged in', { 
    action: 'user_login',
    userId: 'user-123',
    loginMethod: 'password',
    timestamp: new Date().toISOString(),
    duration: 123,
    success: true,
    important: true
  });
  
  console.log('Server logging test completed');
}

/**
 * Test for vector logging
 */
async function testVectorLogging(): Promise<void> {
  console.log('\n--- Testing Vector Logger ---');
  
  // Test vector-specific logging
  vectorLogger.logVectorQuery(
    'What is RAG?',
    { type: 'similarity', dimensions: 1536 },
    5,
    120
  );
  
  // Test slow query
  vectorLogger.logVectorQuery(
    'How do embeddings work?',
    { type: 'similarity', dimensions: 1536 },
    3,
    850
  );
  
  // Test error logging
  vectorLogger.logVectorError(
    'embedding_creation',
    new Error('Test error'),
    { documentId: 'doc-123', metadata: { source: 'test' } }
  );
  
  console.log('Vector logging test completed');
}

/**
 * Main function to run all logging tests
 */
async function main(): Promise<void> {
  await runTests([
    { name: 'Server Logging', fn: testServerLogging },
    { name: 'Vector Logging', fn: testVectorLogging }
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
  { name: 'Server Logging', fn: testServerLogging },
  { name: 'Vector Logging', fn: testVectorLogging }
]; 