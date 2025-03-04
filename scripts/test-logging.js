#!/usr/bin/env node

/**
 * Test script for logging implementation
 * 
 * This script tests various aspects of the logging system:
 * 1. Server-side logging with Pino
 * 2. Client-side logging with batch processing and sampling
 * 3. Business event logging
 * 
 * Run with: node scripts/test-logging.js
 */

// Mock browser environment for client logger
global.window = {
  location: { href: 'http://localhost:3000/test' },
  addEventListener: (event, handler) => console.log(`Added ${event} listener`),
  localStorage: {
    getItem: (key) => key === 'chat_user_id' ? 'test-user-123' : null,
    setItem: (key, value) => console.log(`Set localStorage ${key}=${value}`)
  }
};

// Import loggers
const { createLogger: createServerLogger } = require('../src/utils/server-logger');
const { createLogger: createClientLogger, businessEvents } = require('../src/utils/client-logger');

// Create server logger
const serverLog = createServerLogger('test:server-logger');

// Create client logger
const clientLog = createClientLogger('test:client-logger');

// Test server logging
console.log('\n--- Testing Server Logger ---');
serverLog.trace('This is a trace message', { source: 'test-script' });
serverLog.debug('This is a debug message', { source: 'test-script' });
serverLog.info('This is an info message', { source: 'test-script' });
serverLog.warn('This is a warning message', { source: 'test-script' });
serverLog.error('This is an error message', { source: 'test-script', error: new Error('Test error') });

// Create child logger
const childServerLog = serverLog.child({ requestId: 'req-123', userId: 'user-456' });
childServerLog.info('This is a child logger message', { action: 'test' });

// Test client logging
console.log('\n--- Testing Client Logger ---');
clientLog.trace('This is a trace message', { source: 'test-script' });
clientLog.debug('This is a debug message', { source: 'test-script' });
clientLog.info('This is an info message', { source: 'test-script' });
clientLog.warn('This is a warning message', { source: 'test-script' });
clientLog.error('This is an error message', { source: 'test-script', error: new Error('Test error') });

// Create child logger
const childClientLog = clientLog.child({ sessionId: 'session-123', userId: 'user-456' });
childClientLog.info('This is a child logger message', { action: 'test' });

// Test structured logging
console.log('\n--- Testing Structured Logging ---');
serverLog.info({ 
  action: 'user_login',
  userId: 'user-123',
  loginMethod: 'password',
  timestamp: new Date().toISOString(),
  duration: 123,
  success: true
}, 'User logged in');

clientLog.info({ 
  action: 'page_view',
  page: '/dashboard',
  referrer: '/login',
  timestamp: new Date().toISOString(),
  loadTime: 456,
  userId: 'user-123'
}, 'Page viewed');

// Test business events
console.log('\n--- Testing Business Events ---');
businessEvents.chatStarted('user-123', 'gpt-4');
businessEvents.messageSent('user-123', 150, 'gpt-4');
businessEvents.deepSearchPerformed('user-123', 'What is the meaning of life?', 5);
businessEvents.chatDeleted('user-123', 10);

// Test batch processing
console.log('\n--- Testing Batch Processing ---');
console.log('Sending 15 logs to trigger batch processing...');

// Send enough logs to trigger batch processing
for (let i = 0; i < 15; i++) {
  clientLog.info(`Log message ${i}`, { index: i, timestamp: new Date().toISOString() });
}

// Force flush logs
if (typeof global.flushLogs === 'function') {
  global.flushLogs();
  console.log('Manually flushed logs');
}

console.log('\nLogging test complete. Check the console output above to verify logging functionality.');
console.log('Note: Some client-side features like batch processing and remote logging may not work fully in this Node.js environment.'); 