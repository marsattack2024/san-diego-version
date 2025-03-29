// Import environment variables first - this must be the first import
import '../lib/env-loader';

import { runTest, runTests } from '../lib/test-utils';
import { fileURLToPath } from 'url';
import { logger } from '../../lib/logger';

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
  
  const requestId = 'test-req-123';
  
  // Test vector search logging
  logger.info('Vector search request', {
    operation: 'vector_search',
    query: 'What is RAG?',
    requestId,
    metadata: {
      type: 'similarity',
      dimensions: 1536
    }
  });
  
  // Test slow query logging
  logger.info('Vector search completed', {
    operation: 'vector_search_complete',
    query: 'How do embeddings work?',
    requestId,
    durationMs: 850,
    slow: true,
    documentCount: 3,
    metrics: {
      averageSimilarity: 0.85,
      highestSimilarity: 0.92,
      lowestSimilarity: 0.78
    }
  });
  
  // Test error logging
  logger.error('Vector operation failed', {
    operation: 'embedding_creation',
    error: new Error('Test error'),
    requestId,
    metadata: {
      documentId: 'doc-123',
      source: 'test'
    }
  });
  
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