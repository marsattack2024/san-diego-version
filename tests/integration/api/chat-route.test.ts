// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import { POST } from '@/app/api/chat/route';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
import type { SupabaseClient } from '@supabase/supabase-js';

// 2. Mocks
setupLoggerMock();

// Mock dependencies
vi.mock('@/lib/chat-engine/chat-setup.service');
vi.mock('@/lib/chat-engine/chat-engine.facade');
vi.mock('@/lib/supabase/route-client');
vi.mock('@/lib/utils/route-handler');
// ALSO mock the server client to prevent React cache issues in Node env
vi.mock('@/utils/supabase/server');

// 4. Test Suite
describe('Integration Test: /api/chat Route Handler', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {} };
    const mockSuccessResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    let mockPrepareConfig: Mock;
    let mockHandleRequest: Mock;
    let mockAuthGetUser: Mock;

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // --- Mock Implementations --- 
        mockPrepareConfig = vi.fn().mockResolvedValue(mockEngineConfig);
        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: mockPrepareConfig
        }) as unknown as ChatSetupService);

        mockHandleRequest = vi.fn().mockResolvedValue(mockSuccessResponse);
        vi.mocked(createChatEngine).mockReturnValue(({
            handleRequest: mockHandleRequest
        }) as any);

        mockAuthGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null });
        vi.mocked(createRouteHandlerClient).mockResolvedValue({
            auth: { getUser: mockAuthGetUser }
        } as unknown as SupabaseClient);

        // Mock route handler utils
        vi.mocked(errorResponse).mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        vi.mocked(unauthorizedError).mockImplementation((msg = 'Authentication required') => new Response(JSON.stringify({ error: msg }), { status: 401 }));
        vi.mocked(validationError).mockImplementation((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }));
    });

    const createMockRequest = (body: any): Request => {
        return new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    };

    it('should handle a successful request correctly', async () => {
        const requestBody = { id: 'session-123', message: { role: 'user', content: 'Hello' } };
        const request = createMockRequest(requestBody);

        const response = await POST(request);
        const responseData = await response.json();

        expect(createRouteHandlerClient).toHaveBeenCalledTimes(1);
        expect(mockAuthGetUser).toHaveBeenCalledTimes(1);
        expect(ChatSetupService).toHaveBeenCalledTimes(1);
        expect(mockPrepareConfig).toHaveBeenCalledWith({
            requestBody: requestBody,
            userId: 'test-user-id',
            isWidget: false
        });
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        expect(mockHandleRequest).toHaveBeenCalledTimes(1);
        expect(mockHandleRequest.mock.calls[0][0]).toBeInstanceOf(Request);
        expect(mockHandleRequest.mock.calls[0][1]).toEqual({ parsedBody: requestBody });

        expect(response.status).toBe(200);
        expect(responseData).toEqual({ success: true });
        expect(vi.mocked(errorResponse)).not.toHaveBeenCalled();
        expect(vi.mocked(unauthorizedError)).not.toHaveBeenCalled();
        expect(vi.mocked(validationError)).not.toHaveBeenCalled();
    });

    it('should return 401 Unauthorized if authentication fails', async () => {
        mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth error' } });
        vi.mocked(createRouteHandlerClient).mockResolvedValue({
            auth: { getUser: mockAuthGetUser }
        } as unknown as SupabaseClient);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(response.status).toBe(401);
        expect(vi.mocked(unauthorizedError)).toHaveBeenCalledWith('Authentication required');
        expect(mockPrepareConfig).not.toHaveBeenCalled();
        expect(createChatEngine).not.toHaveBeenCalled();
    });

    it('should return 400 Validation Error if session ID is missing', async () => {
        const request = createMockRequest({ message: 'test' }); // Missing id
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(vi.mocked(validationError)).toHaveBeenCalledWith('Session ID (id) is required');
        expect(createRouteHandlerClient).not.toHaveBeenCalled();
    });

    it('should return 400 Validation Error if messages are missing', async () => {
        const request = createMockRequest({ id: 'session-123' }); // Missing message/messages
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(vi.mocked(validationError)).toHaveBeenCalledWith('Either message or messages field is required');
        expect(createRouteHandlerClient).not.toHaveBeenCalled();
    });

    it('should return 500 if prepareConfig fails', async () => {
        const configError = new Error('Failed to prepare config');
        mockPrepareConfig.mockRejectedValue(configError);
        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: mockPrepareConfig
        }) as unknown as ChatSetupService);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(response.status).toBe(500);
        expect(vi.mocked(errorResponse)).toHaveBeenCalledWith(
            'An unexpected error occurred processing your message',
            configError.message,
            500
        );
        expect(createChatEngine).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in main chat API'),
            expect.objectContaining({ error: configError.message })
        );
    });

    it('should return 500 if engine.handleRequest fails', async () => {
        const handleRequestError = new Error('Engine execution failed');
        mockHandleRequest.mockRejectedValue(handleRequestError);
        vi.mocked(createChatEngine).mockReturnValue(({
            handleRequest: mockHandleRequest
        }) as any);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(response.status).toBe(500);
        expect(vi.mocked(errorResponse)).toHaveBeenCalledWith(
            'An unexpected error occurred processing your message',
            handleRequestError.message,
            500
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in main chat API'),
            expect.objectContaining({ error: handleRequestError.message })
        );
    });

    // TODO: Add test for Auth Bypass logic if re-implemented

}); 