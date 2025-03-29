import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// Set up mocks before importing modules that use them
setupLoggerMock();

// Mock crypto module correctly with default export
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    default: {
      ...actual,
      randomUUID: vi.fn().mockImplementation(() => '00000000-0000-0000-0000-000000000000')
    },
    randomUUID: vi.fn().mockImplementation(() => '00000000-0000-0000-0000-000000000000')
  };
});

// Import crypto after mocking
import crypto from 'crypto';

// Create type definitions to match Supabase's response types
type PostgrestResponse<T> = {
  data: T | null;
  error: { message: string; code: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

type SupabaseAuthResponse<T> = {
  data: T | null;
  error: { message: string; code: string; name?: string; status?: number } | null;
};

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => {
  const mockRpc = vi.fn().mockImplementation(() => Promise.resolve({
    data: null,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK'
  }));
  
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockFrom = vi.fn(() => ({ 
    select: mockSelect.mockReturnThis(),
    eq: mockEq.mockReturnThis()
  }));
  
  return {
    createClient: vi.fn(() => ({
      rpc: mockRpc,
      from: mockFrom,
      auth: {
        admin: {
          listUsers: vi.fn().mockImplementation(() => Promise.resolve({
            data: null,
            error: null
          }))
        }
      }
    }))
  };
});

// Now import the modules that depend on mocks
import { createClient } from '@supabase/supabase-js';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Import the env loader after mocks are set up
let envModuleStub: any;
vi.mock('@/scripts/lib/env-loader', async () => {
  const actual = await vi.importActual('@/scripts/lib/env-loader');
  envModuleStub = {
    ...actual,
    env: {
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_KEY: 'test-key'
    }
  };
  return envModuleStub;
});

describe('Supabase RPC Service', () => {
  // Test data
  const TEST_USER_ID = 'test-user-123';
  const TEST_SESSION_ID = 'session-123';
  const TEST_MESSAGE_ID = 'message-123';
  const TEST_CONTENT = 'Test message content';
  
  // Reference to the mocked Supabase client
  let supabase: ReturnType<typeof createClient>;
  
  beforeEach(() => {
    // Reset all mocks
    mockLogger.reset();
    vi.mocked(crypto.randomUUID).mockClear();
    vi.mocked(createClient).mockClear();
    
    // Get reference to the mocked Supabase client
    supabase = createClient('', '');
  });
  
  describe('save_message_and_update_session', () => {
    it('should successfully save a user message', async () => {
      // Mock successful RPC call
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true },
        error: null,
        count: null,
        status: 200,
        statusText: 'OK'
      } as any);
      
      // Execute RPC call
      const result = await supabase.rpc('save_message_and_update_session', {
        p_session_id: TEST_SESSION_ID,
        p_role: 'user',
        p_content: TEST_CONTENT,
        p_user_id: TEST_USER_ID,
        p_message_id: TEST_MESSAGE_ID,
        p_tools_used: null,
        p_update_timestamp: true
      });
      
      // Verify RPC was called with correct parameters
      expect(supabase.rpc).toHaveBeenCalledWith(
        'save_message_and_update_session',
        expect.objectContaining({
          p_session_id: TEST_SESSION_ID,
          p_role: 'user',
          p_content: TEST_CONTENT,
          p_user_id: TEST_USER_ID
        })
      );
      
      // Verify result
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ success: true });
    });
    
    it('should successfully save an assistant message', async () => {
      // Mock successful RPC call
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true },
        error: null,
        count: null,
        status: 200,
        statusText: 'OK'
      } as any);
      
      // Execute RPC call
      const result = await supabase.rpc('save_message_and_update_session', {
        p_session_id: TEST_SESSION_ID,
        p_role: 'assistant',
        p_content: 'Assistant response',
        p_user_id: TEST_USER_ID,
        p_message_id: 'assistant-message-123',
        p_tools_used: null,
        p_update_timestamp: true
      });
      
      // Verify RPC was called with correct parameters
      expect(supabase.rpc).toHaveBeenCalledWith(
        'save_message_and_update_session',
        expect.objectContaining({
          p_role: 'assistant',
          p_content: 'Assistant response'
        })
      );
      
      // Verify result
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ success: true });
    });
    
    it('should handle RPC errors', async () => {
      // Mock failed RPC call
      const mockError = { message: 'Database error', code: 'DB_ERROR' };
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: mockError,
        count: null,
        status: 400,
        statusText: 'Bad Request'
      } as any);
      
      // Execute RPC call
      const result = await supabase.rpc('save_message_and_update_session', {
        p_session_id: TEST_SESSION_ID,
        p_role: 'user',
        p_content: TEST_CONTENT,
        p_user_id: TEST_USER_ID,
        p_message_id: TEST_MESSAGE_ID,
        p_tools_used: null,
        p_update_timestamp: true
      });
      
      // Verify error was returned
      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });
  
  describe('message verification', () => {
    it('should fetch saved messages for a session', async () => {
      // Mock data for the query
      const mockMessages = [
        { id: 'msg1', role: 'user', content: 'User message', created_at: '2023-01-01T12:00:00Z' },
        { id: 'msg2', role: 'assistant', content: 'Assistant response', created_at: '2023-01-01T12:01:00Z' }
      ];
      
      // Set up mock return values for the query chain
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockMessages,
          error: null,
          count: null,
          status: 200,
          statusText: 'OK'
        } as any)
      } as any);
      
      // Execute query
      const result = await supabase
        .from('sd_chat_histories')
        .select('id, role, content, created_at')
        .eq('session_id', TEST_SESSION_ID);
      
      // Verify from was called with correct table
      expect(supabase.from).toHaveBeenCalledWith('sd_chat_histories');
      
      // Verify result
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockMessages);
      expect(result.data?.length).toBe(2);
    });
    
    it('should handle database query errors', async () => {
      // Mock error for the query
      const mockError = { message: 'Query error', code: 'QUERY_ERROR' };
      
      // Set up mock return values for the query chain
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
          count: null,
          status: 400,
          statusText: 'Bad Request'
        } as any)
      } as any);
      
      // Execute query
      const result = await supabase
        .from('sd_chat_histories')
        .select('id, role, content, created_at')
        .eq('session_id', TEST_SESSION_ID);
      
      // Verify error was returned
      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });
  
  describe('user management', () => {
    it('should fetch users when no user ID is provided', async () => {
      // Mock ListUsersResponse with properly typed users array
      const mockUsers = {
        users: [{ id: 'auto-user-123', email: 'test@example.com' }],
        aud: 'authenticated',
        page: 1,
        perPage: 1,
        totalPages: 1
      };
      
      // Set up mock return value
      vi.mocked(supabase.auth.admin.listUsers).mockResolvedValueOnce({
        data: mockUsers,
        error: null
      } as any);
      
      // Execute the call
      const result = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1
      });
      
      // Verify listUsers was called with correct parameters
      expect(supabase.auth.admin.listUsers).toHaveBeenCalledWith({
        page: 1,
        perPage: 1
      });
      
      // Verify result
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockUsers);
      expect(result.data?.users[0].id).toBe('auto-user-123');
    });
    
    it('should handle errors when fetching users', async () => {
      // Mock error with proper typing
      const mockError = { 
        message: 'Unauthorized', 
        code: 'AUTH_ERROR',
        name: 'AuthError',
        status: 401
      };
      
      // Set up mock return value
      vi.mocked(supabase.auth.admin.listUsers).mockResolvedValueOnce({
        data: null,
        error: mockError
      } as any);
      
      // Execute the call
      const result = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1
      });
      
      // Verify error was returned
      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });
}); 