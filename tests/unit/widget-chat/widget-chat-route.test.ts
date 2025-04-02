/**
 * Widget Chat Route Handler Tests
 * 
 * Tests the functionality of the widget chat API endpoint
 * including the enhanced request body handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, OPTIONS } from '@/app/api/widget-chat/route';
import { createChatEngine } from '@/lib/chat-engine/chat-engine.facade';
import { handleCors } from '@/lib/utils/http-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { validationError, errorResponse } from '@/lib/utils/route-handler';

// Mock dependencies
vi.mock('@/lib/chat-engine/chat-engine.facade', () => ({
    createChatEngine: vi.fn((config) => ({
        handleRequest: vi.fn(async (req, options) => {
            // Mock response that tests both standard and pre-parsed flows
            if (options?.parsedBody) {
                return new Response(JSON.stringify({
                    success: true,
                    message: 'Using pre-parsed body',
                    sessionId: options.parsedBody.sessionId,
                    isWidgetRequest: options.additionalContext?.isWidgetRequest
                }));
            } else {
                return new Response(JSON.stringify({
                    success: true,
                    message: 'Using standard body parsing'
                }));
            }
        })
    }))
}));

vi.mock('@/lib/utils/http-utils', () => ({
    handleCors: vi.fn((response) => response)
}));

vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
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

describe('Widget Chat Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle OPTIONS request for CORS preflight', async () => {
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'OPTIONS'
        });

        const response = await OPTIONS(req);

        expect(response.status).toBe(204);
        expect(handleCors).toHaveBeenCalled();
    });

    it('should process valid widget chat requests with pre-parsed body', async () => {
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Hello from widget',
                sessionId: 'test-session-123'
            })
        });

        const response = await POST(req);
        const data = await response.json();

        // Verify chat engine was created with widget-specific config
        expect(createChatEngine).toHaveBeenCalledWith(expect.objectContaining({
            requiresAuth: false,
            corsEnabled: true,
            messagePersistenceDisabled: true,
            body: expect.objectContaining({
                isWidgetChat: true,
                bypassAuth: true
            })
        }));

        // Verify handleRequest was called with the parsed body option
        const chatEngine = createChatEngine();
        expect(chatEngine.handleRequest).toHaveBeenCalledWith(
            expect.any(Request),
            expect.objectContaining({
                parsedBody: expect.objectContaining({
                    message: 'Hello from widget',
                    sessionId: 'test-session-123'
                }),
                additionalContext: expect.objectContaining({
                    isWidgetRequest: true
                })
            })
        );

        // Verify response contains the expected data
        expect(data.success).toBe(true);
        expect(data.message).toBe('Using pre-parsed body');
        expect(data.sessionId).toBe('test-session-123');
        expect(data.isWidgetRequest).toBe(true);
    });

    it('should handle invalid JSON in request body', async () => {
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{invalid json' // Intentionally invalid
        });

        await POST(req);

        // Verify error response was generated
        expect(errorResponse).toHaveBeenCalledWith(
            'Invalid JSON',
            expect.any(String),
            400
        );
    });

    it('should validate request body schema', async () => {
        const req = new Request('https://example.com/api/widget-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Missing required sessionId
                message: 'Hello from widget'
            })
        });

        await POST(req);

        // Verify validation error was generated
        expect(validationError).toHaveBeenCalledWith(
            'Invalid request body',
            expect.any(Object)
        );
    });
}); 