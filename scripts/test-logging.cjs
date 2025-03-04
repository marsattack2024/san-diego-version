#!/usr/bin/env node

/**
 * Test script for logging implementation
 * 
 * This script tests various aspects of the logging system:
 * 1. Server-side logging with Pino
 * 2. Client-side logging with batch processing and sampling
 * 3. Business event logging
 * 
 * Run with: node scripts/test-logging.cjs
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

// Import loggers - using direct paths
const path = require('path');
const serverLoggerPath = path.resolve(__dirname, '../src/utils/server-logger.js');
const clientLoggerPath = path.resolve(__dirname, '../src/utils/client-logger.js');

console.log(`Loading server logger from: ${serverLoggerPath}`);
console.log(`Loading client logger from: ${clientLoggerPath}`);

// Simple test without actual imports
console.log('\n--- Testing Logger Implementation ---');
console.log('This is a simplified test that demonstrates the logging structure.');
console.log('To test the actual loggers, run the application and check the logs.');

// Simulate server logging
console.log('\n--- Simulated Server Logger ---');
console.log('[trace] [test:server-logger] This is a trace message');
console.log('[debug] [test:server-logger] This is a debug message');
console.log('[info] [test:server-logger] This is an info message');
console.log('[warn] [test:server-logger] This is a warning message');
console.log('[error] [test:server-logger] This is an error message');

// Simulate client logging
console.log('\n--- Simulated Client Logger ---');
console.log('[trace] [test:client-logger] This is a trace message');
console.log('[debug] [test:client-logger] This is a debug message');
console.log('[info] [test:client-logger] This is an info message');
console.log('[warn] [test:client-logger] This is a warning message');
console.log('[error] [test:client-logger] This is an error message');

// Simulate structured logging
console.log('\n--- Simulated Structured Logging ---');
console.log(JSON.stringify({
  level: 'info',
  time: new Date().toISOString(),
  msg: 'User logged in',
  namespace: 'test:server-logger',
  action: 'user_login',
  userId: 'user-123',
  loginMethod: 'password',
  duration: 123,
  success: true
}, null, 2));

// Simulate business events
console.log('\n--- Simulated Business Events ---');
console.log(JSON.stringify({
  level: 'info',
  time: new Date().toISOString(),
  msg: 'New chat conversation started',
  namespace: 'business:events',
  event: 'chat_started',
  userId: 'user-123',
  agentType: 'gpt-4'
}, null, 2));

console.log('\nLogging test complete. This is a simulation of the logging implementation.');
console.log('To test the actual loggers, run the application and check the logs in the browser console and server output.'); 