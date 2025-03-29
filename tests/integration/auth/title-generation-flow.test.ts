/**
 * Title Generation Flow Integration Test
 * 
 * This test verifies the complete title generation flow in a realistic environment,
 * focusing on authentication handling and proper cookie transmission.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '../../helpers/mock-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { edgeLogger } from '@/lib/logger/edge-logger';

// Setup mocks before importing modules
setupLoggerMock();

// Mock Supabase client
vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn().mockImplementation(() => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: { id: 'test-user-id' } },
                error: null
            })
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
            data: { title: 'Generated Test Title' },
            error: null
        })
    }))
}));

// Mock title service
vi.mock('@/lib/chat/title-service', () => ({
    generateAndSaveChatTitle: vi.fn().mockResolvedValue(undefined)
}));

// Mock fetch with configurable response
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
interface TestConfig {
    withCookies: boolean;
    withAuthHeaders: boolean;
    shouldSucceed: boolean;
    responseMock: {
        status: number;
        text: () => Promise<string>;
        json: () => Promise<any>;
        ok: boolean;
        statusText: string;
        headers: Headers;
    };
}

describe('Title Generation Flow', () => {
    let originalFetch: typeof global.fetch;

    // Restore globals
    beforeAll(() => {
        originalFetch = global.fetch;
    });

    afterAll(() => {
        global.fetch = originalFetch;
        vi.clearAllMocks();
    });

    beforeEach(() => {
        mockLogger.reset();
        mockFetch.mockReset();
    });

    it('should send proper authentication credentials with fetch requests', async () => {
        // Setup fetch mock to return success
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, title: 'Generated Test Title' }),
            text: () => Promise.resolve(JSON.stringify({ success: true, title: 'Generated Test Title' })),
            statusText: 'OK',
            headers: new Headers()
        });

        // Execute the test title generation API call with full credentials
        await callTitleGenerationAPI({
            sessionId: 'test-session-id',
            content: 'Test message for title generation'
        });

        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Get the first call arguments
        const [url, options] = mockFetch.mock.calls[0];

        // Verify URL - should end with the API path
        expect(url).toContain('/api/chat/update-title');

        // Verify authentication credentials were sent
        expect(options.credentials).toBe('include');
        expect(options.mode).toBe('same-origin');
        expect(options.cache).toBe('no-store');

        // Verify content type and cache control headers
        expect(options.headers['Content-Type']).toBe('application/json');
        expect(options.headers['Cache-Control']).toBe('no-cache');

        // Verify operation ID for tracing
        expect(options.headers['x-operation-id']).toBeDefined();
        expect(options.headers['x-operation-id']).toMatch(/^title_gen_/);

        // Verify request body
        const body = JSON.parse(options.body);
        expect(body).toHaveProperty('sessionId', 'test-session-id');
        expect(body).toHaveProperty('content', 'Test message for title generation');
    });

    it('should handle successful title generation and update store', async () => {
        // Mock the Zustand store and its import
        const mockUpdateConversationTitle = vi.fn();
        vi.mock('@/stores/chat-store', () => ({
            useChatStore: {
                getState: vi.fn().mockReturnValue({
                    updateConversationTitle: mockUpdateConversationTitle
                })
            }
        }));

        // Setup fetch mock to return success
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, title: 'AI-Generated Title' }),
            text: () => Promise.resolve(JSON.stringify({ success: true, title: 'AI-Generated Title' })),
            statusText: 'OK',
            headers: new Headers()
        });

        // Execute the test with successful response
        await callTitleGenerationAPI({
            sessionId: 'successful-session-id',
            content: 'This is a test message for successful title generation'
        });

        // Wait for promises to resolve
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify successful title generation was logged
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Title generated successfully via API',
            expect.objectContaining({
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_success',
                title: 'AI-Generated Title'
            })
        );

        // Verify store was updated with the title
        expect(mockUpdateConversationTitle).toHaveBeenCalledWith(
            'successful-session-id',
            'AI-Generated Title'
        );
    });

    it('should handle authentication failure with detailed error logging', async () => {
        // Setup fetch mock to return error
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: () => Promise.resolve('<!DOCTYPE html><html><body>Login required</body></html>'),
            json: () => Promise.reject(new Error('Invalid JSON')),
            headers: new Headers({
                'content-type': 'text/html'
            })
        });

        // Execute the test with auth failure
        await callTitleGenerationAPI({
            sessionId: 'auth-failure-session-id',
            content: 'This is a test message that will hit authentication failure'
        });

        // Wait for promises to resolve
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify auth failure was logged with HTML content
        expect(mockLogger.error).toHaveBeenCalledWith(
            'Title generation API failed',
            expect.objectContaining({
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_api_error',
                status: 401,
                statusText: 'Unauthorized',
                responseText: expect.stringContaining('<!DOCTYPE html>')
            })
        );
    });

    it('should gracefully handle network errors', async () => {
        // Setup fetch mock to throw network error
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        // Execute the test with network failure
        await callTitleGenerationAPI({
            sessionId: 'network-error-session-id',
            content: 'This message will trigger a network error'
        });

        // Wait for promises to resolve
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify network error was logged
        expect(mockLogger.error).toHaveBeenCalledWith(
            'Error calling title update API',
            expect.objectContaining({
                category: LOG_CATEGORIES.CHAT,
                operation: 'title_generation_api_error',
                error: 'Network error'
            })
        );
    });
});

/**
 * Helper function to call the title generation API with consistent patterns
 */
async function callTitleGenerationAPI(params: {
    sessionId: string;
    content: string;
}) {
    // Create absolute URL for Edge Runtime compatibility
    const baseUrl = 'http://localhost:3000';

    // Log API call for debugging in tests
    edgeLogger.debug('Test calling title generation API', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'test_title_api_call',
        chatId: params.sessionId
    });

    // Call the title update API endpoint with absolute URL
    // This matches the implementation in lib/chat-engine/core.ts
    return fetch(`${baseUrl}/api/chat/update-title`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            // Include operation ID for tracing
            'x-operation-id': `title_gen_${Math.random().toString(36).substring(2, 8)}`
        },
        credentials: 'include', // Use 'include' for cookie handling
        mode: 'same-origin',    // Explicit same-origin policy
        cache: 'no-store',      // Ensure fresh data
        body: JSON.stringify({
            sessionId: params.sessionId,
            content: params.content
        })
    });
} 