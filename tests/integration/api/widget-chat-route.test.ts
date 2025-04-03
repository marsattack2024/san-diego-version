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

vi.mock('@/lib/chat-engine/chat-setup.service', () => ({
    ChatSetupService: vi.fn().mockImplementation(() => ({ prepareConfig: vi.fn() }))
}));

vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn().mockImplementation(() => ({ handleRequest: vi.fn() }))
}));

vi.mock('@/lib/utils/route-handler', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        errorResponse: vi.fn((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
        successResponse: vi.fn((data) => new Response(JSON.stringify(data), { status: 200 })),
        validationError: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }))
    };
});

vi.mock('@/lib/utils/http-utils', () => ({
    handleCors: vi.fn((res) => res)
}));

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }));

// 3. Import modules AFTER mocks are defined
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { handleCors } from '@/lib/utils/http-utils';
import { errorResponse, validationError, successResponse } from '@/lib/utils/route-handler';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';

// 4. Test Suite
describe('Integration Test: /api/widget-chat Route Handler', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {}, corsEnabled: true }; // Sample widget config
    const mockSuccessResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    const mockErrorPayload = { error: true, message: expect.any(String), success: false, id: expect.any(String), role: 'assistant', content: expect.any(String), createdAt: expect.any(String) };

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Set default mock implementations using vi.mocked()
        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: vi.fn().mockResolvedValue(mockEngineConfig)
        }) as any);

        vi.mocked(createChatEngine).mockImplementation(() => ({
            handleRequest: vi.fn().mockResolvedValue(mockSuccessResponse)
        }) as any);

        // Reset route utils if needed
        vi.mocked(errorResponse).mockClear();
        vi.mocked(successResponse).mockClear();
        vi.mocked(validationError).mockClear();
        vi.mocked(handleCors).mockClear();

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

        // Get mock instances/results for assertions
        const setupServiceInstance = vi.mocked(ChatSetupService).mock.instances[0];
        const engineInstance = vi.mocked(createChatEngine).mock.results[0].value;

        expect(ChatSetupService).toHaveBeenCalledTimes(1);
        expect(setupServiceInstance.prepareConfig).toHaveBeenCalledTimes(1);
        expect(setupServiceInstance.prepareConfig).toHaveBeenCalledWith({
            requestBody: requestBody,
            userId: undefined,
            isWidget: true
        });
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        expect(engineInstance.handleRequest).toHaveBeenCalledTimes(1);
        expect(engineInstance.handleRequest.mock.calls[0][0]).toBeInstanceOf(Request);
        expect(engineInstance.handleRequest.mock.calls[0][1]).toEqual({ parsedBody: requestBody, additionalContext: { isWidgetRequest: true, operationId: expect.any(String) } });

        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData).toEqual({ success: true });
        expect(handleCors).toHaveBeenCalledWith(mockSuccessResponse, request, true);
    });

    it('POST should return 400 Validation Error for invalid body (Zod fail)', async () => {
        const invalidBody = { sessionId: 'invalid-uuid', message: 'test' };
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(validationError).toHaveBeenCalled();
        const setupServiceInstance = vi.mocked(ChatSetupService).mock.instances[0];
        expect(setupServiceInstance?.prepareConfig).not.toHaveBeenCalled();
        expect(handleCors).toHaveBeenCalled();
    });

    it('POST should return 400 Validation Error if message/messages missing', async () => {
        const invalidBody = { sessionId: '123e4567-e89b-12d3-a456-426614174000' };
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(validationError).toHaveBeenCalled();
    });

    it('POST should return 500 (but 200 status for UI) if prepareConfig fails', async () => {
        const configError = new Error('Failed to prep widget config');
        // Override mock
        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: vi.fn().mockRejectedValue(configError)
        }) as any);

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
        expect(handleCors).toHaveBeenCalled();
    });

    it('POST should return 500 (but 200 status for UI) if engine.handleRequest fails', async () => {
        const handleRequestError = new Error('Widget engine failed');
        // Override mock
        vi.mocked(createChatEngine).mockImplementation(() => ({
            handleRequest: vi.fn().mockRejectedValue(handleRequestError)
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
        expect(handleCors).toHaveBeenCalled();
    });

    // --- GET Tests ---
    it('GET should handle wakeup ping', async () => {
        const request = createMockRequest('GET', undefined, { 'x-wakeup-ping': 'true' });
        const response = await GET(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(successResponse).toHaveBeenCalledWith({ status: 'online', timestamp: expect.any(String) });
        expect(responseData.status).toBe('online');
        expect(handleCors).toHaveBeenCalled();
    });

    it('GET should return 405 for other requests', async () => {
        const request = createMockRequest('GET');
        const response = await GET(request);

        expect(response.status).toBe(405);
        expect(errorResponse).toHaveBeenCalledWith('Method not allowed', expect.any(String), 405);
        expect(handleCors).toHaveBeenCalled();
    });

    // --- OPTIONS Test ---
    it('OPTIONS should return 204 with CORS headers', async () => {
        const request = createMockRequest('OPTIONS');
        const response = await OPTIONS(request);

        expect(response.status).toBe(204);
        expect(response.body).toBeNull();
        expect(handleCors).toHaveBeenCalledWith(expect.any(Response), request, true);
    });
}); 