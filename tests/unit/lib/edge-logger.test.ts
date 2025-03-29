import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Setup the logger mock before importing modules that use it
setupLoggerMock();

// Now import the module we want to test
import { edgeLogger } from '@/lib/logger/edge-logger';

describe('Edge Logger', () => {
  beforeEach(() => {
    // Reset the mock before each test
    mockLogger.reset();
  });
  
  describe('Basic Logging', () => {
    it('should log messages at different levels', () => {
      // Test debug level
      edgeLogger.debug('Debug message', { category: LOG_CATEGORIES.SYSTEM });
      expect(mockLogger.debug).toHaveBeenCalledWith('Debug message', { category: LOG_CATEGORIES.SYSTEM });
      
      // Test info level
      edgeLogger.info('Info message', { category: LOG_CATEGORIES.SYSTEM });
      expect(mockLogger.info).toHaveBeenCalledWith('Info message', { category: LOG_CATEGORIES.SYSTEM });
      
      // Test warn level
      edgeLogger.warn('Warning message', { category: LOG_CATEGORIES.SYSTEM });
      expect(mockLogger.warn).toHaveBeenCalledWith('Warning message', { category: LOG_CATEGORIES.SYSTEM });
      
      // Test error level
      const testError = new Error('Test error');
      edgeLogger.error('Error message', { 
        category: LOG_CATEGORIES.SYSTEM,
        error: testError
      });
      expect(mockLogger.error).toHaveBeenCalledWith('Error message', { 
        category: LOG_CATEGORIES.SYSTEM,
        error: testError
      });
    });
    
    it('should include metadata in log messages', () => {
      const metadata = {
        category: LOG_CATEGORIES.SYSTEM,
        operation: 'test_operation',
        userId: 'user-123',
        sessionId: 'session-456',
        important: true
      };
      
      edgeLogger.info('Message with metadata', metadata);
      
      expect(mockLogger.info).toHaveBeenCalledWith('Message with metadata', metadata);
    });
    
    it('should mark important logs appropriately', () => {
      edgeLogger.info('Important message', { 
        category: LOG_CATEGORIES.SYSTEM,
        important: true 
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Important message', { 
        category: LOG_CATEGORIES.SYSTEM,
        important: true 
      });
      
      const importantLogs = mockLogger.getImportantLogs();
      expect(importantLogs.length).toBe(1);
      expect(importantLogs[0].message).toBe('Important message');
    });
  });
  
  describe('Error Logging', () => {
    it('should properly format and log errors', () => {
      const testError = new Error('Test error message');
      
      edgeLogger.error('An error occurred', {
        category: LOG_CATEGORIES.SYSTEM,
        error: testError
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('An error occurred', {
        category: LOG_CATEGORIES.SYSTEM,
        error: testError
      });
    });
    
    it('should handle string errors', () => {
      edgeLogger.error('String error occurred', {
        category: LOG_CATEGORIES.SYSTEM,
        error: 'String error message'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith('String error occurred', {
        category: LOG_CATEGORIES.SYSTEM,
        error: 'String error message'
      });
    });
  });
  
  describe('Operation Tracking', () => {
    it('should track durations of async operations', async () => {
      mockLogger.trackOperation.mockImplementation(async (name, fn, data) => {
        const result = await fn();
        return result;
      });
      
      const result = await edgeLogger.trackOperation(
        'test-operation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'operation-result';
        },
        { category: LOG_CATEGORIES.SYSTEM }
      );
      
      expect(result).toBe('operation-result');
      expect(mockLogger.trackOperation).toHaveBeenCalledWith(
        'test-operation',
        expect.any(Function),
        { category: LOG_CATEGORIES.SYSTEM }
      );
    });
    
    it('should handle errors in tracked operations', async () => {
      const testError = new Error('Operation failed');
      
      mockLogger.trackOperation.mockImplementation(async (name, fn, data) => {
        try {
          return await fn();
        } catch (error) {
          mockLogger.error(`Operation ${name} failed`, { ...data, error });
          throw error;
        }
      });
      
      await expect(
        edgeLogger.trackOperation(
          'failing-operation',
          async () => {
            throw testError;
          },
          { category: LOG_CATEGORIES.SYSTEM }
        )
      ).rejects.toThrow('Operation failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation failing-operation failed',
        expect.objectContaining({
          category: LOG_CATEGORIES.SYSTEM,
          error: testError
        })
      );
    });
  });
  
  describe('Request ID Generation', () => {
    it('should generate unique request IDs', () => {
      mockLogger.generateRequestId.mockImplementation(() => 'req-test-123');
      const id = edgeLogger.generateRequestId();
      
      expect(id).toBe('req-test-123');
      expect(mockLogger.generateRequestId).toHaveBeenCalled();
    });
  });
  
  describe('Log Batching', () => {
    it('should create and complete log batches', () => {
      // Mock implementation
      const mockBatch = {
        addOperation: vi.fn(),
        complete: vi.fn(),
        error: vi.fn()
      };
      mockLogger.startBatch.mockReturnValue(mockBatch);
      
      const batch = edgeLogger.startBatch('test-batch');
      batch.addOperation('operation-1', { status: 'started' });
      batch.addOperation('operation-2', { status: 'running' });
      batch.complete('Batch operations completed', { finalStatus: 'success' });
      
      expect(mockLogger.startBatch).toHaveBeenCalledWith('test-batch');
      expect(mockBatch.addOperation).toHaveBeenCalledWith('operation-1', { status: 'started' });
      expect(mockBatch.addOperation).toHaveBeenCalledWith('operation-2', { status: 'running' });
      expect(mockBatch.complete).toHaveBeenCalledWith('Batch operations completed', { finalStatus: 'success' });
    });
    
    it('should handle errors in batches', () => {
      // Mock implementation
      const mockBatch = {
        addOperation: vi.fn(),
        complete: vi.fn(),
        error: vi.fn()
      };
      mockLogger.startBatch.mockReturnValue(mockBatch);
      
      const batch = edgeLogger.startBatch('error-batch');
      const testError = new Error('Batch failed');
      
      batch.addOperation('failed-operation', { status: 'error' });
      batch.error('Batch operations failed', testError, { finalStatus: 'error' });
      
      expect(mockLogger.startBatch).toHaveBeenCalledWith('error-batch');
      expect(mockBatch.addOperation).toHaveBeenCalledWith('failed-operation', { status: 'error' });
      expect(mockBatch.error).toHaveBeenCalledWith('Batch operations failed', testError, { finalStatus: 'error' });
    });
  });
  
  describe('Log Categories', () => {
    it('should track logs by category', () => {
      edgeLogger.info('Auth log', { category: LOG_CATEGORIES.AUTH });
      edgeLogger.info('System log', { category: LOG_CATEGORIES.SYSTEM });
      edgeLogger.error('Auth error', { category: LOG_CATEGORIES.AUTH, error: 'Test error' });
      
      expect(mockLogger.hasLogWithCategory('info', LOG_CATEGORIES.AUTH)).toBe(true);
      expect(mockLogger.hasLogWithCategory('info', LOG_CATEGORIES.SYSTEM)).toBe(true);
      expect(mockLogger.hasLogWithCategory('error', LOG_CATEGORIES.AUTH)).toBe(true);
      expect(mockLogger.hasLogWithCategory('warn', LOG_CATEGORIES.AUTH)).toBe(false);
    });
  });
}); 