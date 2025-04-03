// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';

// 2. Mocks (Define mocks using factories BEFORE importing)
setupLoggerMock();

// --- Mock Service/Factory Implementations ---
const mockPrepareConfig = vi.fn();
vi.mock('@/lib/chat-engine/chat-setup.service', () => ({
    ChatSetupService: vi.fn().mockImplementation(() => ({ prepareConfig: mockPrepareConfig }))
}));

const mockHandleRequest = vi.fn();
vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn().mockImplementation(() => ({ handleRequest: mockHandleRequest }))
}));

const mockAuthGetUser = vi.fn();
vi.mock('@/lib/supabase/route-client', () => ({
    createRouteHandlerClient: vi.fn().mockImplementation(() => ({ auth: { getUser: mockAuthGetUser } }))
}));

vi.mock('@/lib/utils/route-handler', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        errorResponse: vi.fn((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
        unauthorizedError: vi.fn((msg = 'Authentication required') => new Response(JSON.stringify({ error: msg }), { status: 401 })),
        validationError: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }))
    };
});

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() })); // Prevent cache error

// 3. Import modules AFTER mocks are defined
import { POST } from '@/app/api/chat/route';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
import type { SupabaseClient } from '@supabase/supabase-js'; // Keep for casting if needed

// 4. Test Suite
describe('Shallow Integration Test: /api/chat Route Handler Logic', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {} };
    const mockSuccessResponse = new Response(JSON.stringify({ success: true }), { status: 200 });

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Set default mock implementations
        // These mocks now target the functions defined *within* the vi.mock factories
        vi.mocked(createRouteHandlerClient).mockImplementation(() => ({
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }) }
        }) as any);

        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: vi.fn().mockResolvedValue(mockEngineConfig)
        }) as any);

        vi.mocked(createChatEngine).mockImplementation(() => ({
            handleRequest: vi.fn().mockResolvedValue(mockSuccessResponse)
        }) as any);

        // Clear calls for imported utils
        vi.mocked(errorResponse).mockClear();
        vi.mocked(unauthorizedError).mockClear();
        vi.mocked(validationError).mockClear();
    });

    const createMockRequest = (body: any): Request => {
        return new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    };

    it('should call dependencies and handle success correctly', async () => {
        const requestBody = { id: 'session-123', message: { role: 'user', content: 'Hello' } };
        const request = createMockRequest(requestBody);

        const response = await POST(request);
        const responseData = await response.json();

        // --- Assertions --- 
        expect(createRouteHandlerClient).toHaveBeenCalledTimes(1);
        const supabaseInstance = await vi.mocked(createRouteHandlerClient).mock.results[0].value;
        expect(supabaseInstance.auth.getUser).toHaveBeenCalledTimes(1);

        expect(ChatSetupService).toHaveBeenCalledTimes(1);
        const setupServiceInstance = vi.mocked(ChatSetupService).mock.instances[0];
        expect(setupServiceInstance.prepareConfig).toHaveBeenCalledTimes(1);
        expect(setupServiceInstance.prepareConfig).toHaveBeenCalledWith({
            requestBody: requestBody,
            userId: 'test-user-id',
            isWidget: false
        });

        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        const engineInstance = vi.mocked(createChatEngine).mock.results[0].value;
        expect(engineInstance.handleRequest).toHaveBeenCalledTimes(1);
        // Verify the *cloned* request and parsed body were passed to handleRequest
        expect(engineInstance.handleRequest.mock.calls[0][0]).toBeInstanceOf(Request);
        expect(engineInstance.handleRequest.mock.calls[0][0].url).toBe(request.url);
        expect(engineInstance.handleRequest.mock.calls[0][1]).toEqual({ parsedBody: requestBody });

        expect(response.status).toBe(200);
        expect(responseData).toEqual({ success: true });
        expect(errorResponse).not.toHaveBeenCalled();
        expect(unauthorizedError).not.toHaveBeenCalled();
        expect(validationError).not.toHaveBeenCalled();
    });

    it('should call unauthorizedError if authentication fails', async () => {
        // Override auth mock
        vi.mocked(createRouteHandlerClient).mockImplementation(() => ({
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Auth error' } }) }
        }) as any);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(response.status).toBe(401);
        expect(unauthorizedError).toHaveBeenCalledWith('Authentication required');
        expect(ChatSetupService).not.toHaveBeenCalled(); // Should exit before setup service
        expect(createChatEngine).not.toHaveBeenCalled();
    });

    it('should call validationError if session ID is missing', async () => {
        const request = createMockRequest({ message: 'test' });
        const response = await POST(request);
        expect(response.status).toBe(400);
        expect(validationError).toHaveBeenCalledWith('Session ID (id) is required');
        expect(createRouteHandlerClient).not.toHaveBeenCalled(); // Exits before auth
    });

    it('should call validationError if messages are missing', async () => {
        const request = createMockRequest({ id: 'session-123' });
        const response = await POST(request);
        expect(response.status).toBe(400);
        expect(validationError).toHaveBeenCalledWith('Either message or messages field is required');
        expect(createRouteHandlerClient).not.toHaveBeenCalled(); // Exits before auth
    });

    it('should call errorResponse if prepareConfig fails', async () => {
        const configError = new Error('Failed to prepare config');
        // Override mock
        vi.mocked(ChatSetupService).mockImplementation(() => ({
            prepareConfig: vi.fn().mockRejectedValue(configError)
        }) as any);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(response.status).toBe(500);
        expect(errorResponse).toHaveBeenCalledWith(
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

    it('should call errorResponse if engine.handleRequest fails', async () => {
        const handleRequestError = new Error('Engine execution failed');
        // Override mock
        vi.mocked(createChatEngine).mockImplementation(() => ({
            handleRequest: vi.fn().mockRejectedValue(handleRequestError)
        }) as any);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(response.status).toBe(500);
        expect(errorResponse).toHaveBeenCalledWith(
            'An unexpected error occurred processing your message',
            handleRequestError.message,
            500
        );
        // Verify prepareConfig WAS called in this case
        const setupServiceInstance = vi.mocked(ChatSetupService).mock.instances[0];
        expect(setupServiceInstance.prepareConfig).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in main chat API'),
            expect.objectContaining({ error: handleRequestError.message })
        );
    });

}); 