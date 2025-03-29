/**
 * Mock Clients for Testing
 * 
 * This module provides mock implementations of external services and clients
 * used throughout the application for testing purposes.
 */

import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { mockLogger } from './mock-logger';

// Use the mock logger to avoid console output
const logger = mockLogger;

/**
 * Create a simple mock function
 */
const mockFn = () => {
  const fn = (...args: any[]) => {
    fn.calls.push(args);
    return fn.returnValue;
  };
  
  fn.calls = [] as any[][];
  fn.returnValue = fn;
  
  fn.mockReturnValue = (value: any) => {
    fn.returnValue = value;
    return fn;
  };
  
  fn.mockReturnThis = () => {
    fn.returnValue = fn;
    return fn;
  };
  
  // For resolved promises, we create a special handler that wraps the promise
  // but maintains the mock function interface
  fn.mockResolvedValue = (value: any) => {
    // Instead of directly assigning the promise, create a function that returns the promise
    fn.mockImplementation(() => Promise.resolve(value));
    return fn;
  };
  
  fn.mockImplementation = (implementation: (...args: any[]) => any) => {
    const originalFn = fn;
    const newFn = (...args: any[]) => {
      newFn.calls.push(args);
      return implementation(...args);
    };
    newFn.calls = originalFn.calls;
    newFn.mockReturnValue = originalFn.mockReturnValue;
    newFn.mockResolvedValue = originalFn.mockResolvedValue;
    newFn.mockImplementation = originalFn.mockImplementation;
    newFn.mockReturnThis = originalFn.mockReturnThis;
    newFn.returnValue = originalFn.returnValue;
    return newFn;
  };
  
  return fn;
};

// ======================================================================
// Redis Mock Implementation
// ======================================================================
export class MockRedisClient {
  private store = new Map<string, any>();
  private expirations = new Map<string, number>();

  /**
   * Set a value in the mock Redis store
   */
  async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
    this.store.set(key, value);
    
    // Set expiration if provided
    if (options?.ex) {
      const expiry = Date.now() + (options.ex * 1000);
      this.expirations.set(key, expiry);
    } else {
      this.expirations.delete(key);
    }
    
    logger.debug('Mock Redis SET', { 
      category: LOG_CATEGORIES.CACHE, 
      key, 
      expiry: options?.ex 
    });
    
    return 'OK';
  }

  /**
   * Get a value from the mock Redis store
   */
  async get(key: string): Promise<any> {
    // Check for expiration
    const expiry = this.expirations.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.expirations.delete(key);
      
      logger.debug('Mock Redis expired key', { 
        category: LOG_CATEGORIES.CACHE, 
        key 
      });
      
      return null;
    }
    
    const value = this.store.get(key);
    const exists = value !== undefined;
    
    logger.debug('Mock Redis GET', { 
      category: LOG_CATEGORIES.CACHE, 
      key, 
      exists 
    });
    
    return exists ? value : null;
  }

  /**
   * Delete a key from the mock Redis store
   */
  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    
    this.store.delete(key);
    this.expirations.delete(key);
    
    logger.debug('Mock Redis DEL', { 
      category: LOG_CATEGORIES.CACHE, 
      key, 
      existed 
    });
    
    return existed ? 1 : 0;
  }
  
  /**
   * Check if a key exists in the mock Redis store
   */
  async exists(key: string): Promise<number> {
    // Check for expiration
    const expiry = this.expirations.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.expirations.delete(key);
      return 0;
    }
    
    return this.store.has(key) ? 1 : 0;
  }
  
  /**
   * Clear all data in the mock Redis store
   */
  async flushall(): Promise<void> {
    this.store.clear();
    this.expirations.clear();
    
    logger.debug('Mock Redis FLUSHALL', { 
      category: LOG_CATEGORIES.CACHE 
    });
  }
}

// Export a singleton instance of the mock Redis client
export const mockRedisClient = new MockRedisClient();

// ======================================================================
// Supabase Mock Implementation
// ======================================================================
export const mockSupabaseClient = {
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'authenticated'
        }
      },
      error: null
    }),
    getSession: async () => ({
      data: {
        session: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            role: 'authenticated'
          }
        }
      },
      error: null
    }),
    signOut: async () => ({ error: null })
  },
  
  // Mock database queries
  from: (table: string) => ({
    select: mockFn().mockReturnThis(),
    insert: mockFn().mockReturnThis(),
    update: mockFn().mockReturnThis(),
    delete: mockFn().mockReturnThis(),
    eq: mockFn().mockReturnThis(),
    neq: mockFn().mockReturnThis(),
    gt: mockFn().mockReturnThis(),
    lt: mockFn().mockReturnThis(),
    gte: mockFn().mockReturnThis(),
    lte: mockFn().mockReturnThis(),
    is: mockFn().mockReturnThis(),
    in: mockFn().mockReturnThis(),
    filter: mockFn().mockReturnThis(),
    order: mockFn().mockReturnThis(),
    limit: mockFn().mockReturnThis(),
    single: mockFn().mockReturnThis(),
    maybeSingle: mockFn().mockReturnThis(),
    then: mockFn().mockImplementation((callback) => Promise.resolve(callback({ data: [], error: null }))),
  }),
  
  // RPC calls
  rpc: (func: string, params: any) => ({
    then: mockFn().mockImplementation((callback) => 
      Promise.resolve(callback({ data: [], error: null }))
    )
  }),
  
  storage: {
    from: (bucket: string) => ({
      upload: mockFn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
      download: mockFn().mockResolvedValue({ data: new Blob(['test file content']), error: null }),
      getPublicUrl: mockFn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } })
    })
  }
};

/**
 * Create a mock for Supabase createClient function
 * Returns a mock Supabase client that can be used for testing
 */
export function createMockSupabaseClient() {
  return {
    // Mock implementation
    createClient: mockFn().mockReturnValue(mockSupabaseClient)
  };
}

// ======================================================================
// OpenAI Mock Implementation
// ======================================================================
export const mockOpenAIClient = {
  chat: {
    completions: {
      create: mockFn().mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'This is a mock response from OpenAI.'
            },
            finish_reason: 'stop',
            index: 0
          }
        ],
        model: 'gpt-4o',
        created: Date.now(),
        id: 'mock-completion-id',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15, 
          total_tokens: 25
        }
      })
    }
  },
  
  embeddings: {
    create: mockFn().mockResolvedValue({
      data: [
        {
          embedding: Array(1536).fill(0).map(() => Math.random() * 2 - 1),
          index: 0
        }
      ],
      model: 'text-embedding-ada-002',
      usage: {
        prompt_tokens: 8,
        total_tokens: 8
      }
    })
  }
};

// ======================================================================
// AI SDK Mock Implementation
// ======================================================================
export const mockAIStreamText = mockFn().mockImplementation((options) => {
  return {
    stream: new ReadableStream({
      start(controller) {
        // Simulate streaming response
        const chunks = [
          { type: 'text', value: 'This ' },
          { type: 'text', value: 'is ' },
          { type: 'text', value: 'a ' },
          { type: 'text', value: 'mock ' },
          { type: 'text', value: 'streaming ' },
          { type: 'text', value: 'response.' },
          { type: 'response-metadata', timestamp: new Date() }
        ];
        
        // Schedule chunks to be streamed
        chunks.forEach((chunk, i) => {
          setTimeout(() => {
            controller.enqueue(chunk);
            if (i === chunks.length - 1) {
              controller.close();
            }
          }, i * 50);
        });
      }
    }),
    
    rawCall: {
      rawPrompt: options.messages.map((m: any) => `${m.role}: ${m.content}`).join('\n'),
      rawSettings: {
        model: options.model || 'gpt-4o',
        temperature: options.temperature || 0.7
      }
    }
  };
}); 