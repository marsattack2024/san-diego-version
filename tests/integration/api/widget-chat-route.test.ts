// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { z } from 'zod'; // Import Zod for schema definition
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config'; // Keep this one

// 2. Mocks (Define mocks using factories BEFORE importing code under test or mocked modules)
setupLoggerMock();

// Mock dependencies using vi.fn() for later access if needed inside tests/beforeEach
const mockPrepareConfig = vi.fn();
vi.mock('@/lib/chat-engine/chat-setup.service', () => ({
    // Return a mock CLASS constructor
    // Ensure the constructor itself is tracked by vi.fn()
    ChatSetupService: vi.fn().mockImplementation(() => {
        // The instance returned by the constructor has the mocked method
        return { prepareConfig: mockPrepareConfig };
    })
}));

const mockHandleRequest = vi.fn();
vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    // Return a mock FUNCTION that returns an object with the handleRequest method
    createChatEngine: vi.fn().mockImplementation(() => ({ // mockImplementation for the factory function
        handleRequest: mockHandleRequest // The returned object has the mocked method
    }))
}));

vi.mock('@/lib/utils/http-utils', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        handleCors: vi.fn((res: Response) => res) // Define mock directly inside, add type
    };
});

// Mock route-handler utilities directly within the factory to avoid hoisting issues
vi.mock('@/lib/utils/route-handler', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual, // Preserve other exports if any
        errorResponse: vi.fn((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
        successResponse: vi.fn((data) => new Response(JSON.stringify(data), { status: 200 })),
        validationError: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }))
    };
});

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() })); // Prevent cache error

// 3. Import code under test AND the mocked functions AFTER vi.mock calls
import { POST, GET, OPTIONS } from '@/app/api/widget-chat/route';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service'; // Import mocked version
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade'; // Import mocked version
// Import the mocked utils AFTER defining mocks via vi.mock
import { errorResponse, validationError, successResponse } from '@/lib/utils/route-handler';
// Import mocked http-utils AFTER defining mocks via vi.mock
import { handleCors } from '@/lib/utils/http-utils';

// 4. Test Suite
describe('Shallow Integration Test: /api/widget-chat Route Handler Logic', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {}, corsEnabled: true }; // Sample widget config
    const mockSuccessRespObj = new Response(JSON.stringify({ success: true }), { status: 200 });
    const mockErrorPayload = { error: true, message: expect.any(String), success: false, id: expect.any(String), role: 'assistant', content: expect.any(String), createdAt: expect.any(String) };

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Reset the mock constructor and the method mock
        vi.mocked(ChatSetupService).mockClear(); // Clear calls to the constructor mock
        mockPrepareConfig.mockClear(); // Clear calls to the method mock
        mockHandleRequest.mockClear();

        // Set default mock implementations using the specific vi.fn() instances
        mockPrepareConfig.mockResolvedValue(mockEngineConfig);
        mockHandleRequest.mockResolvedValue(mockSuccessRespObj);
        // Reset using the imported mocked function
        vi.mocked(handleCors).mockImplementation((res: Response) => res); // Use the imported mock, add type
        vi.mocked(errorResponse).mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        vi.mocked(successResponse).mockImplementation((data) => new Response(JSON.stringify(data), { status: 200 }));
        vi.mocked(validationError).mockImplementation((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }));
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

        // Check if the METHOD on the instance was called (implies constructor ran)
        expect(mockPrepareConfig).toHaveBeenCalledTimes(1); // Simplify assertion
        expect(mockPrepareConfig).toHaveBeenCalledWith({ // Use the direct mock fn
            requestBody: requestBody,
            userId: undefined,
            isWidget: true
        });
        // Check if the FACTORY function was called
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        // Check if the METHOD on the returned object was called
        expect(mockHandleRequest).toHaveBeenCalledTimes(1); // Use the direct mock fn
        expect(mockHandleRequest.mock.calls[0][0]).toBeInstanceOf(Request);
        expect(mockHandleRequest.mock.calls[0][1]).toEqual({ parsedBody: requestBody, additionalContext: { isWidgetRequest: true, operationId: expect.any(String) } });

        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData).toEqual({ success: true });
        expect(vi.mocked(handleCors)).toHaveBeenCalledWith(mockSuccessRespObj, request, true); // Use vi.mocked() for imported function
    });

    it('POST should call validationError for invalid body (Zod fail)', async () => {
        const invalidBody = { sessionId: 'invalid-uuid', message: 'test' };
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(vi.mocked(validationError)).toHaveBeenCalled(); // Use vi.mocked() for imported function
        expect(mockPrepareConfig).not.toHaveBeenCalled(); // Use the direct mock fn
        expect(vi.mocked(handleCors)).toHaveBeenCalled(); // Use vi.mocked() for imported function
    });

    it('POST should call validationError if message/messages missing', async () => {
        const invalidBody = { sessionId: '123e4567-e89b-12d3-a456-426614174000' };
        const request = createMockRequest('POST', invalidBody);
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(vi.mocked(validationError)).toHaveBeenCalled(); // Use vi.mocked() for imported function
    });

    it('POST should handle prepareConfig failure', async () => {
        const configError = new Error('Failed to prep widget config');
        mockPrepareConfig.mockRejectedValue(configError); // Use the direct mock fn

        // REMOVED validationError override - let the actual error flow happen

        const request = createMockRequest('POST', { sessionId: 'widget-session-789', message: 'test' });
        const response = await POST(request);
        const responseData = await response.json();

        // ASSERT THE WIDGET-SPECIFIC 200 OK WITH ERROR PAYLOAD
        expect(response.status).toBe(200);
        expect(responseData).toEqual(mockErrorPayload);

        expect(createChatEngine).not.toHaveBeenCalled(); // Check factory function
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: configError.message })
        );
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    it('POST should handle engine.handleRequest failure', async () => {
        const handleRequestError = new Error('Widget engine failed');
        mockHandleRequest.mockRejectedValue(handleRequestError); // Use the direct mock fn

        // REMOVED validationError override - let the actual error flow happen

        const request = createMockRequest('POST', { sessionId: 'widget-session-abc', message: 'test' });
        const response = await POST(request);
        const responseData = await response.json();

        // ASSERT THE WIDGET-SPECIFIC 200 OK WITH ERROR PAYLOAD
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
        // Assert using the imported mocked function
        expect(vi.mocked(successResponse)).toHaveBeenCalledWith({ status: 'online', timestamp: expect.any(String) });
        expect(responseData.status).toBe('online');
        expect(vi.mocked(handleCors)).toHaveBeenCalled(); // Use vi.mocked() for imported function
    });

    it('GET should call errorResponse for other requests', async () => {
        const request = createMockRequest('GET');
        const response = await GET(request);

        expect(response.status).toBe(405);
        // Assert using the imported mocked function
        expect(vi.mocked(errorResponse)).toHaveBeenCalledWith('Method not allowed', expect.any(String), 405);
        expect(vi.mocked(handleCors)).toHaveBeenCalled(); // Use vi.mocked() for imported function
    });

    // --- OPTIONS Test ---
    it('OPTIONS should return 204 with CORS headers', async () => {
        const request = createMockRequest('OPTIONS');
        const response = await OPTIONS(request);

        expect(response.status).toBe(204);
        expect(response.body).toBeNull();
        expect(vi.mocked(handleCors)).toHaveBeenCalledWith(expect.any(Response), request, true); // Use vi.mocked() for imported function
    });
}); 