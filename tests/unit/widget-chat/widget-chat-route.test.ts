/**
 * Widget Chat Route Handler Tests
 * 
 * Tests the functionality of the widget chat API endpoint.
 * Focusing on the core validation and request handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupLoggerMock, mockLogger } from '@/tests/helpers/mock-logger';
import { z } from 'zod';

// Setup mocks BEFORE importing modules that use them
setupLoggerMock();

// Mock dependencies - using factory functions to avoid hoisting issues
vi.mock('@/lib/logger/constants', () => ({
    LOG_CATEGORIES: {
        SYSTEM: 'system',
        CHAT: 'chat',
        TOOLS: 'tools'
    }
}));

vi.mock('@/lib/utils/http-utils', () => ({
    handleCors: vi.fn((response) => response)
}));

vi.mock('@/lib/utils/route-handler', () => ({
    validationError: vi.fn((message) => new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    })),
    errorResponse: vi.fn((message) => new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    }))
}));

// Mock the chat engine facade
const mockHandleRequest = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }))
);

vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn().mockImplementation((config) => ({
        config,
        handleRequest: mockHandleRequest
    }))
}));

// Mock the Supabase client so we don't get cache errors
vi.mock('next/cache', () => ({
    // Use explicit function type to avoid the implicit any error
    cache: (fn: (...args: any[]) => any) => fn
}));

vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn().mockResolvedValue({
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
        }
    })
}));

// Now import required modules
import { handleCors } from '@/lib/utils/http-utils';
import { validationError, errorResponse } from '@/lib/utils/route-handler';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';

// Simple test that verifies the widget chat route validation and error handling
describe('Widget Chat Route Validation', () => {
    // Set up the same schema that's used in the route
    const widgetRequestSchema = z.object({
        message: z.string().optional(),
        messages: z.array(z.object({
            role: z.enum(['user', 'assistant', 'system', 'tool', 'function']),
            content: z.string().or(z.record(z.any())).or(z.null()),
            id: z.string().optional()
        })).optional(),
        sessionId: z.string().uuid()
    }).refine(data =>
        (!!data.message || (Array.isArray(data.messages) && data.messages.length > 0)),
        { message: "Either message or messages must be provided" }
    );

    beforeEach(() => {
        vi.clearAllMocks();
        mockLogger.reset();
        vi.mocked(createChatEngine).mockClear();
        mockHandleRequest.mockClear();
    });

    it('should properly validate request schema - missing session ID', async () => {
        // Test validation with missing sessionId
        const invalidRequestData = {
            message: 'Hello from widget'
            // Missing sessionId
        };

        // Parse the invalid data with the schema
        const result = widgetRequestSchema.safeParse(invalidRequestData);

        // Verify that validation fails
        expect(result.success).toBe(false);

        // Since we explicitly checked result.success is false, 
        // we know the result is the error case of the union type
        if (!result.success) {
            // Check the specific error relates to missing sessionId
            const formattedError = result.error.format();
            expect(formattedError.sessionId).toBeDefined();
        }
    });

    it('should properly validate request schema - missing message', async () => {
        // Test validation with missing message content
        const invalidRequestData = {
            sessionId: '123e4567-e89b-12d3-a456-426614174000'
            // Missing message or messages
        };

        // Parse the invalid data with the schema
        const result = widgetRequestSchema.safeParse(invalidRequestData);

        // Verify that validation fails
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeDefined();
        }
    });

    it('should properly validate request schema - valid data', async () => {
        // Test validation with valid data
        const validRequestData = {
            message: 'Hello from widget',
            sessionId: '123e4567-e89b-12d3-a456-426614174000'
        };

        // Parse the valid data with the schema
        const result = widgetRequestSchema.safeParse(validRequestData);

        // Verify that validation succeeds
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(validRequestData);
        }
    });

    it('should handle OPTIONS requests with CORS headers', async () => {
        // Import only the OPTIONS handler - must be inside the test to ensure mocks are applied first
        const { OPTIONS } = await import('@/app/api/widget-chat/route');

        // Create a mock request
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'OPTIONS'
        });

        // Call the handler
        const response = await OPTIONS(req);

        // Verify the response
        expect(response.status).toBe(204);
        expect(handleCors).toHaveBeenCalledWith(
            expect.any(Response),
            req,
            true
        );
    });

    it('should use gpt-4o-mini model for the widget', async () => {
        // Import the POST handler inside the test to ensure mocks are applied
        const { POST } = await import('@/app/api/widget-chat/route');

        // Create a valid request
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Hello from widget',
                sessionId: '123e4567-e89b-12d3-a456-426614174000'
            })
        });

        // Call the handler
        await POST(req);

        // Verify that createChatEngine was called with gpt-4o-mini model
        expect(createChatEngine).toHaveBeenCalledTimes(1);
        expect(createChatEngine).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-4o-mini',
                maxTokens: 800,
                temperature: 0.4
            })
        );
    });
}); 