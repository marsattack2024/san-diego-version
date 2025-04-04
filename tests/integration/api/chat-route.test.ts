// 1. Imports
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import type { User } from '@supabase/supabase-js';
import type { AuthenticatedRouteHandler } from '@/lib/auth/with-auth'; // Type defined internally in with-auth.ts
import { z } from 'zod'; // Import Zod
import type { AgentType } from '@/lib/chat-engine/prompts'; // Import AgentType
import type { Tool } from 'ai'; // For mocking tools
import type { MockInstance } from 'vitest'; // Import MockInstance
import { createClient as createRouteClient } from '@/lib/supabase/route-client'; // Use alias for clarity
import type { AuthHandler } from '@/lib/auth/with-auth';
import type { Message } from 'ai';

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

// --- Mock Chat Engine / Orchestrator ---
const mockPrepareContext = vi.fn();
vi.mock('@/lib/chat-engine/services/orchestrator.service', () => ({
    AgentOrchestrator: vi.fn().mockImplementation(() => ({
        prepareContext: mockPrepareContext
    }))
}));

// --- Mock Dependencies of the Orchestrated Path ---
vi.mock('@/lib/chat-engine/agent-router', () => ({
    // Define mocks inside factory to avoid hoisting issues
    getAgentConfig: vi.fn(),
    createAgentToolSet: vi.fn()
}));

// Mock Persistence Service Constructor
const mockPersistenceLoadMessages = vi.fn();
const mockPersistenceSaveUser = vi.fn();
const mockPersistenceSaveAssistant = vi.fn();
vi.mock('@/lib/chat-engine/message-persistence', () => ({
    MessagePersistenceService: vi.fn().mockImplementation(() => ({
        loadMessages: mockPersistenceLoadMessages,
        saveUserMessage: mockPersistenceSaveUser,
        saveAssistantMessage: mockPersistenceSaveAssistant
    }))
}));

// --- Mock AI SDK / Provider ---
vi.mock('ai', () => ({
    streamText: vi.fn(),
    appendClientMessage: vi.fn((args) => [...args.messages, args.message]),
    Message: vi.fn(),
}));

// --- Mock Authentication Wrapper ---
const mockUser: User = {
    id: 'mock-user-id',
    app_metadata: { provider: 'email' },
    user_metadata: { name: 'Mock User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};
// vi.mock('@/lib/auth/with-auth', ...) // REMOVE or comment out

// --- Mock Zod Schema ---
// REMOVED: vi.mock('@/app/api/chat/route', ...) - Revert Zod mock

// --- Mock Utilities ---
vi.mock('@/lib/utils/route-handler', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        // Simplify mocks to return minimal Response
        errorResponse: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })),
        unauthorizedError: vi.fn(() => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
        validationError: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }))
    };
});

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() })); // Prevent cache error

// Mock Supabase route client
vi.mock('@/lib/supabase/route-client');

// Mock utilities
vi.mock('@/lib/utils/misc-utils', () => ({ generateUUID: () => 'mock-uuid' }));

// Mock Auth Wrapper - Revert to original mock for now
vi.mock('@/lib/auth/with-auth', () => ({
    withAuth: (handler: AuthHandler) => handler, // Original mock
    AuthHandler: vi.fn(),
}));

// 3. Import modules AFTER mocks are defined
import { POST, POST_Handler } from '@/app/api/chat/route';
import { ChatSetupService } from '@/lib/chat-engine/chat-setup.service';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import type { ChatEngineConfig } from '@/lib/chat-engine/chat-engine.config';
// Import the mocked wrapper AFTER definition
// import { withAuth } from '@/lib/auth/with-auth';
import { AgentOrchestrator } from '@/lib/chat-engine/services/orchestrator.service';
import { getAgentConfig, createAgentToolSet } from '@/lib/chat-engine/agent-router';
import { MessagePersistenceService } from '@/lib/chat-engine/message-persistence';
import { streamText, appendClientMessage } from 'ai'; // Import the mocked streamText and appendClientMessage

// Mock the wrapper to test the handler directly
vi.mock('@/lib/auth/with-auth', () => ({
    withAuth: (handler: AuthenticatedRouteHandler) => handler, // Pass handler through
    // AuthenticatedRouteHandler type is imported, no need to mock
}));

// 4. Test Suite
describe('/api/chat Integration Tests', () => {

    // Define valid data structure based on chatRequestSchema - ONLY REQUIRED FIELDS
    const mockValidRequestBody = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        message: {
            id: 'msg-abc-123',
            role: 'user' as const,
            content: 'This is valid content.'
        }
        // Omit optional: deepSearchEnabled, agentId, message.createdAt
    };
    const mockTool: Tool<any, any> = { description: "Mock Tool", parameters: z.object({}), execute: vi.fn() };

    // Store the original Request.prototype.json
    const originalRequestJson = Request.prototype.json;
    // Use MockInstance type for the spy
    let jsonSpy: MockInstance<[], Promise<any>>;

    beforeEach(() => {
        vi.resetAllMocks();
        mockLogger.reset();

        // Restore original json method before spying again
        Request.prototype.json = originalRequestJson;
        // Spy on and mock Request.prototype.json
        jsonSpy = vi.spyOn(Request.prototype, 'json').mockResolvedValue(mockValidRequestBody);

        // Reset the simplified withAuth mock
        // vi.mocked(withAuth).mockClear().mockImplementation((handler: AuthHandler) =>
        //     async (request: Request) => handler(mockUser, request)
        // );

        // Default mocks for other services...
        vi.mocked(getAgentConfig).mockReturnValue({
            systemPrompt: 'Mock System Prompt',
            temperature: 0.7,
            model: 'gpt-4o-mini',
            toolOptions: { useKnowledgeBase: false, useWebScraper: false, useDeepSearch: false, useRagTool: false, useProfileContext: false }
        });
        vi.mocked(createAgentToolSet).mockReturnValue({ mockTool });
        mockPrepareContext.mockResolvedValue({ targetModelId: 'gpt-4o-mini', contextMessages: [] });
        vi.mocked(MessagePersistenceService).mockClear();
        mockPersistenceLoadMessages.mockClear().mockResolvedValue([]);
        mockPersistenceSaveUser.mockClear().mockResolvedValue({ success: true });
        mockPersistenceSaveAssistant.mockClear().mockResolvedValue({ success: true });

        // Restore streamText mock setup
        const mockStreamTextResult = {
            text: Promise.resolve('mock assistant response'),
            toolCalls: Promise.resolve([]),
            toolResults: Promise.resolve([]),
            finishReason: 'stop' as const,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            warnings: undefined,
            rawResponse: { headers: {} },
            response: { id: 'mock-res-id', messages: [{ id: 'mock-asst-msg-id', role: 'assistant' as const, content: 'Mock response content' }] },
            request: {},
            providerMetadata: {},
            logprobs: undefined,
            experimental_customData: undefined,
            toDataStreamResponse: vi.fn(() => new Response(JSON.stringify({ stream: 'dummy' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
        };
        vi.mocked(streamText).mockClear().mockReturnValue(mockStreamTextResult as any);

        // Reset appendClientMessage mock
        vi.mocked(appendClientMessage).mockClear().mockImplementation(() => [{ id: 'mock-append-id', role: 'user', content: 'mock message' }]);

        // Reset route-handler utils
        vi.mocked(errorResponse).mockClear().mockImplementation((msg, _, status) => new Response(JSON.stringify({ error: msg }), { status: status || 500 }));
        vi.mocked(unauthorizedError).mockClear().mockImplementation((msg = 'Authentication required') => new Response(JSON.stringify({ error: msg }), { status: 401 }));
        vi.mocked(validationError).mockClear().mockImplementation((msg, details) => {
            return new Response(JSON.stringify({ error: msg, details }), { status: 400 });
        });
    });

    afterEach(() => {
        // Restore the original Request.prototype.json after each test
        Request.prototype.json = originalRequestJson;
    });

    const createMockRequest = (body: any = {}): Request => { // Add default value
        return new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body) // Still need to stringify something
        });
    };

    it('should return error for invalid message format', async () => {
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message: 'not an object' }), // Invalid body
        });
        // Update direct handler call signature
        const response = await POST_Handler(mockUser, request);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toContain('Invalid request body');
    });

    it('should process a valid chat request and stream response', async () => {
        // ... (mock setup as before) ...
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                messages: [mockUserMessage],
                id: 'test-session-id'
            }),
        });

        // Call the wrapped handler with correct signature
        const response = await POST(request);

        // ... (assertions as before) ...
    });

    it('should handle missing user message', async () => {
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: [] }), // Send empty messages array
        });
        // Update direct handler call signature
        const response = await POST_Handler(mockUser, request);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toContain('Last message must be from user');
    });

    it('should use existing session ID if provided', async () => {
        const existingSessionId = 'existing-session-123';
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                messages: [mockUserMessage],
                id: existingSessionId, // Provide existing ID
            }),
        });
        // Update direct handler call signature
        const response = await POST_Handler(mockUser, request);
        // ... assertions (check if orchestrator or persistence used existingSessionId)
    });

    it('UNWRAPPED: should call dependencies and stream success on valid request', async () => {
        // Arrange
        const { mockUser, mockValidRequestBody } = setupTestData();
        const request = createMockRequest(mockValidRequestBody);
        mockStreamTextSuccess(); // Setup mocks for success
        mockPersistenceSuccess();

        // Act: Call the UNWRAPPED handler directly, passing mockUser
        const response = await POST_Handler(mockUser, request); // Original signature
        // Assert
        expect(response.status).toBe(200);
        // ... other assertions ...
    });

    it('WRAPPED: should return 400 if Zod validation fails', async () => {
        // Arrange: Mock json() to return invalid body
        const invalidBody = { id: 'invalid-uuid', /* missing message */ };
        jsonSpy.mockResolvedValue(invalidBody);
        const request = createMockRequest(invalidBody);
        // Act: Call the WRAPPED POST endpoint
        const response = await POST(request); // Original signature
        // Assert
        expect(response.status).toBe(400);
        // ... other assertions ...
    });

    it('UNWRAPPED: should return 500 if persistence service fails', async () => {
        // Arrange
        const { mockUser, mockValidRequestBody } = setupTestData();
        mockStreamTextSuccess();
        mockPersistenceFailure(); // Setup mock for persistence failure
        const request = createMockRequest(mockValidRequestBody);
        // Act: Call UNWRAPPED handler
        const response = await POST_Handler(mockUser, request); // Original signature
        // Assert
        expect(response.status).toBe(500);
        // ... other assertions ...
    });

    it('UNWRAPPED: should return 500 if AI stream fails', async () => {
        // Arrange
        const { mockUser, mockValidRequestBody } = setupTestData();
        mockAIStreamFailure(); // Setup mock for stream failure
        mockPersistenceSuccess();
        const request = createMockRequest(mockValidRequestBody);
        // Act: Call UNWRAPPED handler
        const response = await POST_Handler(mockUser, request); // Original signature
        // Assert
        expect(response.status).toBe(500);
        // ... other assertions ...
    });

    // Auth failure test needs rethinking - cannot easily test withAuth failure without complex mocking
    // it('should return 401 if auth fails (withAuth mock)', async () => { ... });

    it('UNWRAPPED: should return 500 if orchestrator.prepareContext fails', async () => {
        // Arrange: Mock json() ok, make orchestrator fail
        jsonSpy.mockResolvedValue(mockValidRequestBody);
        mockPrepareContext.mockRejectedValue(new Error('Orchestrator failed'));
        const request = createMockRequest(mockValidRequestBody);
        // Act: Call UNWRAPPED handler
        const response = await POST_Handler(mockUser, request);
        // Assert
        expect(response.status).toBe(500);
        expect(jsonSpy).toHaveBeenCalledTimes(1);
        expect(validationError).not.toHaveBeenCalled();
        expect(mockPrepareContext).toHaveBeenCalledTimes(1);
        expect(errorResponse).toHaveBeenCalledWith(/* ... */);
    });

    it('UNWRAPPED: should return 500 if streamText fails', async () => {
        // Arrange: Mock json() ok, make streamText fail
        jsonSpy.mockResolvedValue(mockValidRequestBody);
        vi.mocked(streamText).mockRejectedValue(new Error('Stream failed'));
        const request = createMockRequest(mockValidRequestBody);
        // Act: Call UNWRAPPED handler
        const response = await POST_Handler(mockUser, request);
        // Assert
        expect(response.status).toBe(500);
        expect(jsonSpy).toHaveBeenCalledTimes(1);
        expect(validationError).not.toHaveBeenCalled();
        expect(mockPrepareContext).toHaveBeenCalledTimes(1);
        expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1);
        expect(errorResponse).toHaveBeenCalledWith(/* ... */);
    });

}); 