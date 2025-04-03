// 1. Imports
import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import type { User } from '@supabase/supabase-js';
import type { AuthHandler } from '@/lib/auth/with-auth'; // Type defined internally in with-auth.ts

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

// --- Mock Authentication Wrapper ---
// Define a mock user for successful authentication cases
const mockUser: User = {
    id: 'mock-user-id',
    app_metadata: { provider: 'email' },
    user_metadata: { name: 'Mock User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

// Mock the withAuth wrapper itself
vi.mock('@/lib/auth/with-auth', () => ({
    // Default implementation: passes through to the handler with a mock user
    withAuth: vi.fn().mockImplementation((handler: AuthHandler) => {
        // Return the signature expected by the route: (req: Request) => Promise<Response>
        return async (request: Request) => {
            // Call the original handler, injecting the mock user and the request
            return handler(mockUser, request); // Pass mockUser and request
        };
    })
}));

// --- Mock Utilities ---
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
// IMPORTANT: Import the specific handler logic if exported separately, otherwise import the wrapped route
import { POST } from '@/app/api/chat/route'; // Assuming POST exports the *wrapped* handler
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
// REMOVED: import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
// Import the mocked wrapper AFTER definition
import { withAuth } from '@/lib/auth/with-auth';

// 4. Test Suite
describe('Shallow Integration Test: /api/chat Route Handler Logic (withAuth mocked)', () => {

    const mockEngineConfig: Partial<ChatEngineConfig> = { agentType: 'default', useDeepSearch: false, tools: {} };
    const mockSuccessResponse = new Response(JSON.stringify({ success: true }), { status: 200 });

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Default: Mock withAuth to simulate successful authentication
        vi.mocked(withAuth).mockImplementation((handler: AuthHandler) => {
            return async (request: Request) => {
                // Simulate the wrapper calling the handler with user and request
                return handler(mockUser, request);
            };
        });

        // Set default mock implementations for internal services
        mockPrepareConfig.mockResolvedValue(mockEngineConfig);
        mockHandleRequest.mockResolvedValue(mockSuccessResponse);

        // Clear and set default implementation for route-handler utils
        vi.mocked(errorResponse).mockClear().mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        vi.mocked(unauthorizedError).mockClear().mockImplementation((msg = 'Authentication required') => new Response(JSON.stringify({ error: msg }), { status: 401 }));
        // Ensure validationError mock returns the specific message
        vi.mocked(validationError).mockClear().mockImplementation((msg) => {
            console.log(`validationError mocked with message: ${msg}`); // Debug log
            return new Response(JSON.stringify({ error: msg }), { status: 400 });
        });
    });

    const createMockRequest = (body: any): Request => {
        return new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    };

    it('should call dependencies and handle success correctly (withAuth mocked successfully)', async () => {
        const requestBody = { id: 'session-123', message: { role: 'user', content: 'Hello' } };
        const request = createMockRequest(requestBody);

        // Ensure the default mock implementation returns a valid Response
        mockHandleRequest.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

        const response = await POST(request);

        // Now this should not be undefined
        expect(response).toBeDefined();
        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData).toEqual({ success: true });

        // --- Assertions for internal calls ---
        expect(withAuth).toHaveBeenCalled();
        expect(mockPrepareConfig).toHaveBeenCalledWith({
            requestBody: requestBody,
            userId: mockUser.id,
            isWidget: false
        });
        expect(createChatEngine).toHaveBeenCalledWith(mockEngineConfig);
        expect(mockHandleRequest).toHaveBeenCalledTimes(1);
        expect(errorResponse).not.toHaveBeenCalled();
        expect(unauthorizedError).not.toHaveBeenCalled();
        expect(validationError).not.toHaveBeenCalled();
    });

    it('should return 401 if withAuth mock simulates failure', async () => {
        const mockUnauthorizedResponse = new Response(JSON.stringify({ error: 'Simulated Auth Fail' }), { status: 401 });
        // Override withAuth mock 
        vi.mocked(withAuth).mockImplementation((handler: AuthHandler) => {
            return async (request: Request) => {
                // Call the unauthorizedError utility mock to ensure it's tracked if needed
                vi.mocked(unauthorizedError)('Simulated Auth Fail');
                return mockUnauthorizedResponse; // Return the response object
            };
        });

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(withAuth).toHaveBeenCalled(); // Wrapper was called
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Simulated Auth Fail' });
        // Check the utility was called by the wrapper mock
        expect(unauthorizedError).toHaveBeenCalledWith('Simulated Auth Fail');
        expect(mockPrepareConfig).not.toHaveBeenCalled();
        expect(mockHandleRequest).not.toHaveBeenCalled();
    });

    it('should call validationError if session ID is missing (before withAuth)', async () => {
        const request = createMockRequest({ message: 'test' });
        const response = await POST(request);

        // Check that the validationError mock returned the expected response
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Session ID (id) is required' });

        expect(validationError).toHaveBeenCalledWith('Session ID (id) is required');
        expect(withAuth).not.toHaveBeenCalled(); // Should exit before wrapper
    });

    it('should call validationError if messages are missing (before withAuth)', async () => {
        const request = createMockRequest({ id: 'session-123' });
        const response = await POST(request);

        // Check that the validationError mock returned the expected response
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Either message or messages field is required' });

        expect(validationError).toHaveBeenCalledWith('Either message or messages field is required');
        expect(withAuth).not.toHaveBeenCalled(); // Should exit before wrapper
    });

    it('should call errorResponse if prepareConfig fails (after withAuth success)', async () => {
        const configError = new Error('Failed to prepare config');
        mockPrepareConfig.mockRejectedValue(configError);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(withAuth).toHaveBeenCalled(); // Wrapper was called and succeeded 
        expect(mockPrepareConfig).toHaveBeenCalled(); // Internal logic was called

        // Check that the errorResponse mock returned the expected response
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'An unexpected error occurred processing your message' });

        expect(errorResponse).toHaveBeenCalledWith(
            'An unexpected error occurred processing your message',
            configError.message,
            500
        );
        expect(mockHandleRequest).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in main chat API'),
            expect.objectContaining({ error: configError.message })
        );
    });

    it('should call errorResponse if engine.handleRequest fails (after withAuth success)', async () => {
        const handleRequestError = new Error('Engine execution failed');
        mockHandleRequest.mockRejectedValue(handleRequestError);

        const request = createMockRequest({ id: 'session-123', message: 'test' });
        const response = await POST(request);

        expect(withAuth).toHaveBeenCalled(); // Wrapper succeeded
        expect(mockPrepareConfig).toHaveBeenCalled(); // Setup service succeeded
        expect(mockHandleRequest).toHaveBeenCalled(); // Engine handleRequest was called

        // Check that the errorResponse mock returned the expected response
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'An unexpected error occurred processing your message' });

        expect(errorResponse).toHaveBeenCalledWith(
            'An unexpected error occurred processing your message',
            handleRequestError.message,
            500
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled error in main chat API'),
            expect.objectContaining({ error: handleRequestError.message })
        );
    });

}); 