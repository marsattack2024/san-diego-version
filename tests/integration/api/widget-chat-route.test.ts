// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { errorResponse, validationError, successResponse } from '@/lib/utils/route-handler';
import { z } from 'zod'; // Import Zod for schema definition
import { POST, GET, OPTIONS } from '@/app/api/widget-chat/route';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { handleCors } from '@/lib/utils/http-utils';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';

// 2. Mocks
setupLoggerMock();

vi.mock('@/lib/chat-engine/chat-setup.service');
vi.mock('@/lib/chat-engine/chat-engine.facade');
vi.mock('@/lib/utils/route-handler');
vi.mock('@/lib/utils/http-utils');
vi.mock('@/utils/supabase/server');

// 4. Test Suite
describe('Integration Test: /api/widget-chat Route Handler', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {}, corsEnabled: true }; // Sample widget config
    const mockSuccessResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    const mockErrorPayload = { error: true, message: expect.any(String), success: false, id: expect.any(String), role: 'assistant', content: expect.any(String), createdAt: expect.any(String) };

    let mockPrepareConfig: Mock;
    let mockHandleRequest: Mock;

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

        // Mock route handler utils
        vi.mocked(errorResponse).mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        vi.mocked(successResponse).mockImplementation((data) => new Response(JSON.stringify(data), { status: 200 }));
        vi.mocked(validationError).mockImplementation((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }));

        // Mock CORS utility (simple passthrough)
        vi.mocked(handleCors).mockImplementation((res) => res);
    });

    const createMockRequest = (method: 'POST' | 'GET' | 'OPTIONS', body?: any, headers?: HeadersInit): Request => {
        return new Request('http://localhost/api/widget-chat', {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined
        });
    };

    // --- POST Tests ---
    it('POST should handle a successful request', async () => {
        const requestBody = { sessionId: 'widget-session-456', message: 'Hello Widget' };
        const request = createMockRequest('POST', requestBody);

        const response = await POST(request);
        // Note: We assert on the response *before* handleCors is applied in the real implementation
        // because handleCors is mocked as a passthrough here.
        // const responseData = await response.json(); // This might fail if handleCors modifies response

        // Check mocks
        expect(ChatSetupService).toHaveBeenCalledTimes(1);
        expect(mockPrepareConfig).toHaveBeenCalledWith({
            requestBody: requestBody,
            userId: undefined,
            isWidget: true
        });
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        expect(mockHandleRequest).toHaveBeenCalledTimes(1);
        expect(mockHandleRequest.mock.calls[0][0]).toBeInstanceOf(Request); // Cloned request
        expect(mockHandleRequest.mock.calls[0][1]).toEqual({ parsedBody: requestBody, additionalContext: { isWidgetRequest: true, operationId: expect.any(String) } });

        // Check final response (which should be the one from handleRequest via mockHandleCors)
        expect(response.status).toBe(200);
        // expect(responseData).toEqual({ success: true }); // Check if needed based on handleCors mock
    });

    it('POST should return 400 Validation Error for invalid body (Zod fail)', async () => {
        const invalidBody = { sessionId: 'invalid-uuid', message: 'test' }; // Invalid UUID
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(vi.mocked(validationError)).toHaveBeenCalled();
        expect(mockPrepareConfig).not.toHaveBeenCalled();
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    it('POST should return 400 Validation Error if message/messages missing', async () => {
        const invalidBody = { sessionId: '123e4567-e89b-12d3-a456-426614174000' }; // Missing message
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(vi.mocked(validationError)).toHaveBeenCalled();
    });

    it('POST should return 500 (but 200 status for UI) if prepareConfig fails', async () => {
        const configError = new Error('Failed to prep widget config');
        mockPrepareConfig.mockRejectedValue(configError);
        // Re-mock instance method for this test
        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: mockPrepareConfig
        }) as unknown as ChatSetupService);

        const request = createMockRequest('POST', { sessionId: 'widget-session-789', message: 'test' });
        const response = await POST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData).toEqual(mockErrorPayload);
        expect(createChatEngine).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: configError.message })
        );
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    it('POST should return 500 (but 200 status for UI) if engine.handleRequest fails', async () => {
        const handleRequestError = new Error('Widget engine failed');
        mockHandleRequest.mockRejectedValue(handleRequestError);
        // Re-mock factory return value for this test
        vi.mocked(createChatEngine).mockReturnValue(({
            handleRequest: mockHandleRequest
        }) as any);

        const request = createMockRequest('POST', { sessionId: 'widget-session-abc', message: 'test' });
        const response = await POST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData).toEqual(mockErrorPayload);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: handleRequestError.message })
        );
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    // --- GET Tests ---
    it('GET should handle wakeup ping', async () => {
        const request = createMockRequest('GET', undefined, { 'x-wakeup-ping': 'true' });
        const response = await GET(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(vi.mocked(successResponse)).toHaveBeenCalledWith({ status: 'online', timestamp: expect.any(String) });
        expect(responseData.status).toBe('online');
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    it('GET should return 405 for other requests', async () => {
        const request = createMockRequest('GET');
        const response = await GET(request);

        expect(response.status).toBe(405);
        expect(vi.mocked(errorResponse)).toHaveBeenCalledWith('Method not allowed', expect.any(String), 405);
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    // --- OPTIONS Test ---
    it('OPTIONS should return 204 with CORS headers', async () => {
        const request = createMockRequest('OPTIONS');
        const response = await OPTIONS(request);

        expect(response.status).toBe(204);
        expect(response.body).toBeNull();
        expect(vi.mocked(handleCors)).toHaveBeenCalledWith(expect.any(Response), request, true);
    });
}); 