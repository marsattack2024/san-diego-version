/**
 * Mock Logger for Testing
 * 
 * This module provides a mock implementation of the edge logger for testing purposes.
 * It captures log messages instead of outputting them and provides methods for assertions.
 */

import { LOG_CATEGORIES, LOG_LEVELS, type LogCategory, type LogMetadata } from '@/lib/logger/constants';
import { vi } from 'vitest';

// Type for log level keys that match our logs object structure
type LogLevelKey = 'debug' | 'info' | 'warn' | 'error';

/**
 * Mock Logger Class
 * Captures logs instead of printing them, and provides assertion methods
 */
export class MockLogger {
  // Store logs by level for inspection and assertions
  logs = {
    debug: [] as Array<{ message: string, metadata: LogMetadata }>,
    info: [] as Array<{ message: string, metadata: LogMetadata }>,
    warn: [] as Array<{ message: string, metadata: LogMetadata }>,
    error: [] as Array<{ message: string, metadata: LogMetadata }>
  };
  
  // Create spy functions for each log level
  debug = vi.fn((message: string, metadata: LogMetadata = {}) => {
    this.logs.debug.push({ message, metadata });
  });
  
  info = vi.fn((message: string, metadata: LogMetadata = {}) => {
    this.logs.info.push({ message, metadata });
  });
  
  warn = vi.fn((message: string, metadata: LogMetadata = {}) => {
    this.logs.warn.push({ message, metadata });
  });
  
  error = vi.fn((message: string, metadata: LogMetadata = {}) => {
    this.logs.error.push({ message, metadata });
  });
  
  // Reset all logs and spy function call history
  reset() {
    this.logs.debug = [];
    this.logs.info = [];
    this.logs.warn = [];
    this.logs.error = [];
    
    this.debug.mockClear();
    this.info.mockClear();
    this.warn.mockClear();
    this.error.mockClear();
  }
  
  // Assertion helper for checking if a log was called with specified category
  hasLogWithCategory(level: LogLevelKey, category: LogCategory): boolean {
    return this.logs[level].some(log => log.metadata.category === category);
  }
  
  // Helper to get logs for a specific category
  getLogsByCategory(category: LogCategory): Array<{ level: LogLevelKey, message: string, metadata: LogMetadata }> {
    const result: Array<{ level: LogLevelKey, message: string, metadata: LogMetadata }> = [];
    
    (Object.keys(this.logs) as Array<LogLevelKey>).forEach(level => {
      this.logs[level].forEach(log => {
        if (log.metadata.category === category) {
          result.push({ level, message: log.message, metadata: log.metadata });
        }
      });
    });
    
    return result;
  }
  
  // Helper to check if any error was logged
  hasErrors(): boolean {
    return this.logs.error.length > 0;
  }
  
  // Helper to get important logs across all levels
  getImportantLogs(): Array<{ level: LogLevelKey, message: string, metadata: LogMetadata }> {
    const result: Array<{ level: LogLevelKey, message: string, metadata: LogMetadata }> = [];
    
    (Object.keys(this.logs) as Array<LogLevelKey>).forEach(level => {
      this.logs[level].forEach(log => {
        if (log.metadata.important) {
          result.push({ level, message: log.message, metadata: log.metadata });
        }
      });
    });
    
    return result;
  }
}

// Create a singleton instance
export const mockLogger = new MockLogger();

/**
 * Mock the edgeLogger for tests
 * Call this function to set up the mock before tests that use logging
 */
export function setupLoggerMock() {
  // Reset the mock before setup
  mockLogger.reset();
  
  // Set up the mock module
  vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: mockLogger
  }));
  
  return mockLogger;
} 