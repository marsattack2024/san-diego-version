// 1. Imports
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { z } from 'zod';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
import type { MockInstance } from 'vitest'; // Import MockInstance
import { getAgentConfig } from '@/lib/chat-engine/agent-router'; // Keep import

// 2. Mocks (Define mocks using factories BEFORE importing code under test or mocked modules)
setupLoggerMock();

// --- Mock Chat Engine Services ---
const mockPrepareConfig = vi.fn();
vi.mock('@/lib/chat-engine/chat-setup.service', () => ({
    ChatSetupService: vi.fn().mockImplementation(() => ({
        prepareConfig: mockPrepareConfig
    }))
}));

const mockHandleRequest = vi.fn();
vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn().mockImplementation(() => ({
        handleRequest: mockHandleRequest
    }))
}));

// --- Mock Utilities ---
vi.mock('@/lib/utils/http-utils', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return { ...actual, handleCors: vi.fn((res: Response) => res) };
});

vi.mock('@/lib/utils/route-handler', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        errorResponse: vi.fn((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
        successResponse: vi.fn((data) => new Response(JSON.stringify(data), { status: 200 })),
        validationError: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }))
    };
});

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() })); // Prevent cache error

// 3. Import modules AFTER mocks are defined
import { POST, GET, OPTIONS } from '@/app/api/widget-chat/route'; // Import only handlers
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { handleCors } from '@/lib/utils/http-utils';
import { errorResponse, validationError, successResponse } from '@/lib/utils/route-handler';

// Define the base config first
const defaultMockAgentConfigBase = {
    systemPrompt: 'Default Base Prompt',
    temperature: 0.5,
    model: 'gpt-4o',
    maxTokens: 1000,
    toolOptions: { useKnowledgeBase: true, useWebScraper: true, useDeepSearch: true, useRagTool: true, useProfileContext: true }
} as any;

// Mock dependencies using factory functions
vi.mock('@/lib/chat-engine/agent-router', () => ({
    getAgentConfig: vi.fn(),
    detectAgentType: vi.fn()
}));

// 4. Test Suite
describe('Shallow Integration Test: /api/widget-chat Route Handler Logic (Zod Mocked)', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {}, corsEnabled: true };
    const mockSuccessRespObj = new Response(JSON.stringify({ success: true }), { status: 200 });
    const mockErrorPayload = { error: true, message: expect.any(String), success: false, id: expect.any(String), role: 'assistant', content: expect.any(String), createdAt: expect.any(String) };
    const mockValidRequestBody = {
        sessionId: '789e4567-e89b-12d3-a456-426614174999',
        message: 'Valid widget message content'
    };

    // Store the original Request.prototype.json and declare spy variable
    const originalRequestJson = Request.prototype.json;
    let jsonSpy: MockInstance<[], Promise<any>>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockLogger.reset();
        Request.prototype.json = originalRequestJson;
        jsonSpy = vi.spyOn(Request.prototype, 'json').mockResolvedValue(mockValidRequestBody);

        // Reset direct mock function variables (if needed, though clearAllMocks might cover)
        mockPrepareConfig.mockClear();
        mockHandleRequest.mockClear();

        // Set default mock implementations
        mockPrepareConfig.mockResolvedValue(mockEngineConfig);
        mockHandleRequest.mockResolvedValue(mockSuccessRespObj);
        vi.mocked(getAgentConfig).mockReturnValue(defaultMockAgentConfigBase);
        vi.mocked(handleCors).mockImplementation((res: Response) => res);
        vi.mocked(errorResponse).mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        vi.mocked(successResponse).mockImplementation((data) => new Response(JSON.stringify(data), { status: 200 }));
        vi.mocked(validationError).mockImplementation((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }));
    });

    afterEach(() => {
        // Restore the original Request.prototype.json after each test
        Request.prototype.json = originalRequestJson;
    });

    const createMockRequest = (method: 'POST' | 'GET' | 'OPTIONS', body: any = {}, headers: HeadersInit = {}): Request => {
        return new Request('http://localhost/api/widget-chat', {
            method,
            // Merge default and provided headers
            headers: { 'Content-Type': 'application/json', ...headers },
            body: method === 'POST' ? JSON.stringify(body) : null
        });
    };

    it('POST should call dependencies and handle success correctly', async () => {
        // Arrange: Default json() mock provides valid body
        const request = createMockRequest('POST'); // Body arg ignored now
        // Act
        const response = await POST(request);
        // Assert
        expect(jsonSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData).toEqual({ success: true });
        expect(validationError).not.toHaveBeenCalled();
        expect(mockPrepareConfig).toHaveBeenCalledTimes(1);
        expect(mockPrepareConfig).toHaveBeenCalledWith({
            requestBody: mockValidRequestBody,
            userId: undefined,
            isWidget: true
        });
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        expect(mockHandleRequest).toHaveBeenCalledTimes(1);
    });

    it('POST should call validationError for invalid body (Zod mock fail)', async () => {
        // Arrange: Override json() mock to return INVALID body
        const invalidBody = { sessionId: 'invalid-uuid' }; // Missing message/messages
        jsonSpy.mockResolvedValue(invalidBody);
        const request = createMockRequest('POST', invalidBody); // Pass for consistency

        // Act
        const response = await POST(request);

        // Assert: Expect validationError to be called by the actual route logic
        expect(jsonSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(400);
        expect(validationError).toHaveBeenCalledWith('Invalid request body', expect.any(Object));
        expect(mockPrepareConfig).not.toHaveBeenCalled();
    });

    it('POST should handle prepareConfig failure (after Zod success)', async () => {
        // Arrange: json() returns valid body (default), prepareConfig fails
        const configError = new Error('Failed to prep widget config');
        mockPrepareConfig.mockRejectedValue(configError);
        const request = createMockRequest('POST');

        // Act
        const response = await POST(request);
        const responseData = await response.json();

        // Assert: Widget specific error handling (200 OK + payload)
        expect(jsonSpy).toHaveBeenCalledTimes(1);
        expect(validationError).not.toHaveBeenCalled(); // Zod passed implicitly
        expect(response.status).toBe(200);
        expect(responseData).toEqual(mockErrorPayload);
        expect(mockPrepareConfig).toHaveBeenCalledTimes(1); // It was called
        expect(createChatEngine).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: configError.message })
        );
    });

    it('POST should handle engine.handleRequest failure (after Zod success)', async () => {
        // Arrange: json() returns valid body (default), handleRequest fails
        mockPrepareConfig.mockResolvedValue(mockEngineConfig); // Ensure this succeeds
        const handleRequestError = new Error('Widget engine failed');
        mockHandleRequest.mockRejectedValue(handleRequestError);
        const request = createMockRequest('POST');

        // Act
        const response = await POST(request);
        const responseData = await response.json();

        // Assert: Widget specific error handling (200 OK + payload)
        expect(jsonSpy).toHaveBeenCalledTimes(1);
        expect(validationError).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
        expect(responseData).toEqual(mockErrorPayload);
        expect(mockPrepareConfig).toHaveBeenCalledTimes(1);
        expect(createChatEngine).toHaveBeenCalledTimes(1);
        expect(mockHandleRequest).toHaveBeenCalledTimes(1); // It was called
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in widget chat route'),
            expect.objectContaining({ error: handleRequestError.message })
        );
    });

    // --- GET Tests ---
    it('GET should handle wakeup ping', async () => {
        const request = createMockRequest('GET', null, { 'x-wakeup-ping': 'true' });
        const response = await GET(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(vi.mocked(successResponse)).toHaveBeenCalledWith({ status: 'online', timestamp: expect.any(String) });
        expect(responseData.status).toBe('online');
        expect(vi.mocked(handleCors)).toHaveBeenCalled();
    });

    it('GET should call errorResponse for other requests', async () => {
        const request = createMockRequest('GET');
        const response = await GET(request);

        expect(response.status).toBe(405);
        // Expect 3 arguments based on previous failure message
        expect(vi.mocked(errorResponse)).toHaveBeenCalledWith('Method not allowed', 'Use POST to interact with the widget', 405);
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