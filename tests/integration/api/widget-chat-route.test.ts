// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { z } from 'zod'; // Import Zod for schema definition
import { POST, GET, OPTIONS } from '@/app/api/widget-chat/route';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { handleCors } from '@/lib/utils/http-utils';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config'; // Keep this one
// Import the mocked utils after defining mocks
import { errorResponse, validationError, successResponse } from '@/lib/utils/route-handler';

// 2. Mocks (Define mocks using factories BEFORE importing)
setupLoggerMock();

const mockPrepareConfig = vi.fn();
vi.mock('@/lib/chat-engine/chat-setup.service', () => ({
    ChatSetupService: vi.fn(() => ({ prepareConfig: mockPrepareConfig }))
}));

const mockHandleRequest = vi.fn();
vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn(() => ({ handleRequest: mockHandleRequest }))
}));

const mockErrorResponse = vi.fn((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
const mockSuccessResponse = vi.fn((data) => new Response(JSON.stringify(data), { status: 200 }));
const mockValidationError = vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }));
vi.mock('@/lib/utils/route-handler', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return { ...actual, errorResponse: mockErrorResponse, successResponse: mockSuccessResponse, validationError: mockValidationError };
});

const mockHandleCors = vi.fn((res) => res);
vi.mock('@/lib/utils/http-utils', () => ({ handleCors: mockHandleCors }));

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() })); // Prevent cache error

// 4. Test Suite
describe('Shallow Integration Test: /api/widget-chat Route Handler Logic', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {}, corsEnabled: true }; // Sample widget config
    const mockSuccessRespObj = new Response(JSON.stringify({ success: true }), { status: 200 });
    const mockErrorPayload = { error: true, message: expect.any(String), success: false, id: expect.any(String), role: 'assistant', content: expect.any(String), createdAt: expect.any(String) };

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Set default mock implementations
        mockPrepareConfig.mockResolvedValue(mockEngineConfig);
        mockHandleRequest.mockResolvedValue(mockSuccessRespObj);
        // Reset util mocks if needed (resetAllMocks should cover vi.fn)
        mockErrorResponse.mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        mockSuccessResponse.mockImplementation((data) => new Response(JSON.stringify(data), { status: 200 }));
        mockValidationError.mockImplementation((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }));
        mockHandleCors.mockImplementation((res) => res);
    });

    const createMockRequest = (method: 'POST' | 'GET' | 'OPTIONS', body?: any, headers?: HeadersInit): Request => {
        return new Request('http://localhost/api/widget-chat', {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined
        });
    };

    // --- POST Tests ---
    it('POST should call dependencies and handle success correctly', async () => {
        const requestBody = { sessionId: 'widget-session-456', message: 'Hello Widget' };
        const request = createMockRequest('POST', requestBody);

        const response = await POST(request);

        expect(ChatSetupService).toHaveBeenCalledTimes(1);
        expect(mockPrepareConfig).toHaveBeenCalledWith({
            requestBody: requestBody,
            userId: undefined,
            isWidget: true
        });
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        expect(mockHandleRequest).toHaveBeenCalledTimes(1);
        expect(mockHandleRequest.mock.calls[0][0]).toBeInstanceOf(Request);
        expect(mockHandleRequest.mock.calls[0][1]).toEqual({ parsedBody: requestBody, additionalContext: { isWidgetRequest: true, operationId: expect.any(String) } });

        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData).toEqual({ success: true });
        expect(mockHandleCors).toHaveBeenCalledWith(mockSuccessRespObj, request, true);
    });

    it('POST should call validationError for invalid body (Zod fail)', async () => {
        const invalidBody = { sessionId: 'invalid-uuid', message: 'test' };
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(mockValidationError).toHaveBeenCalled();
        expect(mockPrepareConfig).not.toHaveBeenCalled();
        expect(mockHandleCors).toHaveBeenCalled();
    });

    it('POST should call validationError if message/messages missing', async () => {
        const invalidBody = { sessionId: '123e4567-e89b-12d3-a456-426614174000' };
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(mockValidationError).toHaveBeenCalled();
    });

    it('POST should handle prepareConfig failure', async () => {
        const configError = new Error('Failed to prep widget config');
        mockPrepareConfig.mockRejectedValue(configError);

        const request = createMockRequest('POST', { sessionId: 'widget-session-789', message: 'test' });
        const response = await POST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200); // Widget specific error handling
        expect(responseData).toEqual(mockErrorPayload);
        expect(createChatEngine).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: configError.message })
        );
        expect(mockHandleCors).toHaveBeenCalled();
    });

    it('POST should handle engine.handleRequest failure', async () => {
        const handleRequestError = new Error('Widget engine failed');
        mockHandleRequest.mockRejectedValue(handleRequestError);

        const request = createMockRequest('POST', { sessionId: 'widget-session-abc', message: 'test' });
        const response = await POST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200); // Widget specific error handling
        expect(responseData).toEqual(mockErrorPayload);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: handleRequestError.message })
        );
        expect(mockHandleCors).toHaveBeenCalled();
    });

    // --- GET Tests ---
    it('GET should handle wakeup ping', async () => {
        const request = createMockRequest('GET', undefined, { 'x-wakeup-ping': 'true' });
        const response = await GET(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(mockSuccessResponse).toHaveBeenCalledWith({ status: 'online', timestamp: expect.any(String) });
        expect(responseData.status).toBe('online');
        expect(mockHandleCors).toHaveBeenCalled();
    });

    it('GET should call errorResponse for other requests', async () => {
        const request = createMockRequest('GET');
        const response = await GET(request);

        expect(response.status).toBe(405);
        expect(mockErrorResponse).toHaveBeenCalledWith('Method not allowed', expect.any(String), 405);
        expect(mockHandleCors).toHaveBeenCalled();
    });

    // --- OPTIONS Test ---
    it('OPTIONS should return 204 with CORS headers', async () => {
        const request = createMockRequest('OPTIONS');
        const response = await OPTIONS(request);

        expect(response.status).toBe(204);
        expect(response.body).toBeNull();
        expect(mockHandleCors).toHaveBeenCalledWith(expect.any(Response), request, true);
    });
}); 