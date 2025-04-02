/**
 * Mock Logger for Testing
 * 
 * This module provides a mock implementation of the logger for tests.
 * It captures log messages and allows verification in tests.
 */
import { vi } from 'vitest';
import { LOG_CATEGORIES, LOG_LEVELS } from '@/lib/logger/constants';

// Create a mock logger that can be used in tests
export const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),

  // Additional methods from edgeLogger
  startTimer: vi.fn(),
  endTimer: vi.fn(),
  generateRequestId: vi.fn().mockImplementation(() => `req-${Math.random().toString(36).substring(2, 8)}`),
  startGroup: vi.fn(),
  addToGroup: vi.fn(),
  endGroup: vi.fn(),
  trackOperation: vi.fn().mockImplementation(async (name, fn, data) => {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      mockLogger.error(`Operation ${name} failed`, {
        ...data,
        error
      });
      throw error;
    }
  }),
  startBatch: vi.fn().mockImplementation((batchId) => ({
    addOperation: vi.fn(),
    complete: vi.fn(),
    error: vi.fn()
  })),

  // Helper methods for testing
  reset() {
    this.debug.mockClear();
    this.info.mockClear();
    this.warn.mockClear();
    this.error.mockClear();
    this.startTimer.mockClear();
    this.endTimer.mockClear();
    this.generateRequestId.mockClear();
    this.startGroup.mockClear();
    this.addToGroup.mockClear();
    this.endGroup.mockClear();
    this.trackOperation.mockClear();
    this.startBatch.mockClear();
  },

  // Check if a log at the given level with the given category exists
  hasLogWithCategory(level: string, category: string): boolean {
    const logFn = this[level as keyof typeof mockLogger] as any;
    if (!logFn || typeof logFn !== 'function') return false;

    return logFn.mock.calls.some((call: any[]) => {
      const metadataArg = call[1] || {};
      return metadataArg.category === category;
    });
  },

  // Get all logs marked as important
  getImportantLogs(): Array<{ level: string, message: string, metadata: any }> {
    const importantLogs = [];

    for (const level of ['debug', 'info', 'warn', 'error']) {
      const logFn = this[level as keyof typeof mockLogger] as any;
      if (!logFn || typeof logFn !== 'function') continue;

      for (const call of logFn.mock.calls) {
        const message = call[0];
        const metadata = call[1] || {};

        if (metadata.important) {
          importantLogs.push({ level, message, metadata });
        }
      }
    }

    return importantLogs;
  },

  // Get logs containing a specific string
  getLogsContaining(text: string): Array<{ level: string, message: string, metadata: any }> {
    const matchingLogs = [];

    for (const level of ['debug', 'info', 'warn', 'error']) {
      const logFn = this[level as keyof typeof mockLogger] as any;
      if (!logFn || typeof logFn !== 'function') continue;

      for (const call of logFn.mock.calls) {
        const message = call[0];
        const metadata = call[1] || {};

        if (typeof message === 'string' && message.includes(text)) {
          matchingLogs.push({ level, message, metadata });
        }
      }
    }

    return matchingLogs;
  }
};

// Thresholds used in the edge-logger
export const THRESHOLDS = {
  RAG_TIMEOUT: 5000, // 5 seconds
  API_TIMEOUT: 10000, // 10 seconds
  SLOW_THRESHOLD_MS: 2000, // 2 seconds
  VERY_SLOW_THRESHOLD_MS: 5000, // 5 seconds
  MAX_LOG_SIZE: 10000, // Maximum size of log in characters
  MAX_MESSAGE_COUNT_FOR_TITLE: 5, // Only generate titles for new chats with few messages
  PERPLEXITY_TIMEOUT: 20000 // 20 seconds
};

// Setup function to mock the logger before importing code under test
export const setupLoggerMock = () => {
  // Mock the edge-logger module
  vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: mockLogger,
    THRESHOLDS // Include the thresholds in the mock
  }));

  // Mock the logger module (if needed)
  vi.mock('@/lib/logger', () => ({
    logger: mockLogger
  }));

  // Reset mock call history
  mockLogger.reset();

  return mockLogger;
};

export default setupLoggerMock; 