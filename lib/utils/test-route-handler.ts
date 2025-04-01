/**
 * Test Route Handler Utilities
 * 
 * This library provides a framework for creating development/test-only API routes
 * that are automatically disabled in production environments. These utilities are 
 * part of the application's production code but enable safer testing by:
 * 
 * 1. Automatically preventing execution in production environments
 * 2. Providing standardized logging for test route access attempts
 * 3. Enabling easy creation of mock API endpoints with configurable behavior
 * 4. Supporting both static and dynamic response generation
 * 
 * This code should remain in lib/utils as it's an application utility that
 * gets deployed but contains self-protecting mechanisms to prevent execution
 * in production environments.
 */

import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

/**
 * Guards any test route to prevent execution in production environments
 * @param handler The route handler function to protect
 * @returns A function that will only execute in development environments
 */
export function guardTestRoute<T extends (...args: any[]) => Promise<Response>>(
    handler: T
): T {
    const guardedHandler = (async (...args: Parameters<T>): Promise<Response> => {
        // Check if we're in a test or development environment
        const isDevOrTest = process.env.NODE_ENV === 'development' ||
            process.env.NODE_ENV === 'test';

        if (!isDevOrTest) {
            edgeLogger.warn('Attempted to access test route in production', {
                category: LOG_CATEGORIES.SYSTEM,
                url: args[0]?.url,
                method: args[0]?.method,
                important: true
            });

            return NextResponse.json(
                { error: 'Test routes disabled in production' },
                { status: 404 }
            );
        }

        try {
            // Execute the handler only in development/test environments
            return await handler(...args);
        } catch (error) {
            edgeLogger.error('Error in test route', {
                category: LOG_CATEGORIES.SYSTEM,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });

            return NextResponse.json(
                {
                    error: 'Test route error',
                    message: error instanceof Error ? error.message : String(error)
                },
                { status: 500 }
            );
        }
    }) as T;

    return guardedHandler;
}

/**
 * Creates a mock route handler for testing purposes
 * @param mockData The data to return from the mock handler
 * @param options Additional options for the mock handler
 * @returns A route handler function that returns the mock data
 */
export function createMockHandler(
    mockData: any,
    options: {
        status?: number;
        delay?: number;
        headers?: Record<string, string>;
    } = {}
): (req: Request) => Promise<Response> {
    const { status = 200, delay = 0, headers = {} } = options;

    return guardTestRoute(async (req: Request): Promise<Response> => {
        // Log the test request
        edgeLogger.info('Test route called', {
            category: LOG_CATEGORIES.SYSTEM,
            method: req.method,
            url: req.url
        });

        // Simulate processing delay if specified
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Return the mock response
        return NextResponse.json(mockData, {
            status,
            headers: {
                'X-Test-Route': 'true',
                ...headers
            }
        });
    });
}

/**
 * Example usage in a test route:
 *
 * ```typescript
 * // app/api/test/mock-data/route.ts
 * import { createMockHandler } from '@/lib/utils/test-route-handler';
 * 
 * export const runtime = 'edge';
 * 
 * const mockData = {
 *   items: [
 *     { id: 1, name: 'Test Item 1' },
 *     { id: 2, name: 'Test Item 2' }
 *   ],
 *   count: 2
 * };
 * 
 * export const GET = createMockHandler(mockData, { 
 *   delay: 500, // 500ms delay
 *   headers: { 'Cache-Control': 'no-cache' }
 * });
 * ```
 */ 