/**
 * Unit tests for test-route-handler.ts utilities
 * 
 * This test file verifies the functionality of the test route handler utilities located
 * in lib/utils/test-route-handler.ts. These tests ensure that:
 * 
 * 1. Guardian mechanisms properly prevent execution in production environments
 * 2. Mock handlers correctly return configured responses
 * 3. Test routes correctly handle errors
 * 4. Delay mechanisms work as expected
 * 5. Custom headers and status codes are properly applied
 * 
 * This file follows the project convention of placing test files in a directory structure 
 * that mirrors the source code, with test-specific code isolated from the production codebase.
 * It remains separate from the utility implementation to maintain clean separation between
 * code that is deployed and code that only runs during development/testing.
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { guardTestRoute, createMockHandler } from '@/lib/utils/test-route-handler';

// Mock dependencies
vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn((data, options) => ({
            data,
            status: options?.status || 200,
            headers: options?.headers || {},
            get: vi.fn(),
            json: vi.fn().mockImplementation(() => data)
        }))
    }
}));

vi.mock('@/lib/logger/edge-logger', () => ({
    edgeLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

describe('test-route-handler', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Restore NODE_ENV
        vi.unstubAllEnvs();
    });

    describe('guardTestRoute', () => {
        const mockHandler = vi.fn().mockResolvedValue(new Response('Test response'));
        const guardedHandler = guardTestRoute(mockHandler);
        const mockRequest = new Request('https://example.com');

        it('should execute the handler in development environment', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');

            // Act
            await guardedHandler(mockRequest);

            // Assert
            expect(mockHandler).toHaveBeenCalledWith(mockRequest);
            expect(edgeLogger.warn).not.toHaveBeenCalled();
        });

        it('should execute the handler in test environment', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'test');

            // Act
            await guardedHandler(mockRequest);

            // Assert
            expect(mockHandler).toHaveBeenCalledWith(mockRequest);
            expect(edgeLogger.warn).not.toHaveBeenCalled();
        });

        it('should not execute the handler in production environment', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'production');

            // Act
            const response = await guardedHandler(mockRequest);

            // Assert
            expect(mockHandler).not.toHaveBeenCalled();
            expect(edgeLogger.warn).toHaveBeenCalledWith(
                'Attempted to access test route in production',
                expect.objectContaining({
                    category: LOG_CATEGORIES.SYSTEM,
                    url: mockRequest.url,
                    important: true
                })
            );
            expect(NextResponse.json).toHaveBeenCalledWith(
                { error: 'Test routes disabled in production' },
                { status: 404 }
            );
        });

        it('should handle errors thrown by the handler', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');
            const testError = new Error('Test error');
            const errorHandler = vi.fn().mockRejectedValue(testError);
            const guardedErrorHandler = guardTestRoute(errorHandler);

            // Act
            await guardedErrorHandler(mockRequest);

            // Assert
            expect(edgeLogger.error).toHaveBeenCalledWith(
                'Error in test route',
                expect.objectContaining({
                    category: LOG_CATEGORIES.SYSTEM,
                    error: testError.message,
                    stack: testError.stack
                })
            );
            expect(NextResponse.json).toHaveBeenCalledWith(
                {
                    error: 'Test route error',
                    message: testError.message
                },
                { status: 500 }
            );
        });
    });

    describe('createMockHandler', () => {
        const mockData = { test: 'data' };
        const mockRequest = new Request('https://example.com');

        it('should create a handler that returns the mock data', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');
            const handler = createMockHandler(mockData);

            // Act
            const response = await handler(mockRequest);

            // Assert
            expect(edgeLogger.info).toHaveBeenCalledWith(
                'Test route called',
                expect.objectContaining({
                    category: LOG_CATEGORIES.SYSTEM,
                    method: mockRequest.method,
                    url: mockRequest.url
                })
            );
            expect(NextResponse.json).toHaveBeenCalledWith(
                mockData,
                expect.objectContaining({
                    status: 200,
                    headers: expect.objectContaining({
                        'X-Test-Route': 'true'
                    })
                })
            );
        });

        it('should respect custom status code', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');
            const handler = createMockHandler(mockData, { status: 201 });

            // Act
            await handler(mockRequest);

            // Assert
            expect(NextResponse.json).toHaveBeenCalledWith(
                mockData,
                expect.objectContaining({
                    status: 201
                })
            );
        });

        it('should respect custom headers', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');
            const handler = createMockHandler(mockData, {
                headers: { 'Cache-Control': 'no-cache' }
            });

            // Act
            await handler(mockRequest);

            // Assert
            expect(NextResponse.json).toHaveBeenCalledWith(
                mockData,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-Test-Route': 'true',
                        'Cache-Control': 'no-cache'
                    })
                })
            );
        });

        it('should apply delay when specified', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');
            const handler = createMockHandler(mockData, { delay: 100 });
            vi.useFakeTimers();

            // Act
            const responsePromise = handler(mockRequest);

            // We should be waiting now
            expect(NextResponse.json).not.toHaveBeenCalled();

            // Fast-forward time
            vi.advanceTimersByTime(100);
            await responsePromise;

            // Assert
            expect(NextResponse.json).toHaveBeenCalled();

            vi.useRealTimers();
        });

        it('should not execute in production environment', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'production');
            const handler = createMockHandler(mockData);

            // Act
            await handler(mockRequest);

            // Assert
            expect(edgeLogger.info).not.toHaveBeenCalled();
            expect(edgeLogger.warn).toHaveBeenCalledWith(
                'Attempted to access test route in production',
                expect.anything()
            );
        });
    });

    // Test integration with actual route
    describe('integration with route handler', () => {
        it('should integrate with a typical route handler', async () => {
            // Arrange
            vi.stubEnv('NODE_ENV', 'development');
            const mockData = {
                items: [
                    { id: 1, name: 'Test Item 1' },
                    { id: 2, name: 'Test Item 2' }
                ],
                count: 2
            };

            // Create mock route handler similar to how it would be used in a route.ts file
            const GET = createMockHandler(mockData, {
                delay: 50,
                headers: { 'Cache-Control': 'no-cache' }
            });

            // Act
            const mockResponse = await GET(new Request('https://example.com/api/test'));

            // Assert that mockResponse is the properly formed mock object
            const mockJsonResponse = mockResponse as unknown as {
                data: typeof mockData;
                status: number;
                headers: Record<string, string>;
            };

            expect(mockJsonResponse).toBeDefined();
            expect(mockJsonResponse.data).toEqual(mockData);
            expect(mockJsonResponse.headers['X-Test-Route']).toBe('true');
            expect(mockJsonResponse.headers['Cache-Control']).toBe('no-cache');
        });
    });
}); 