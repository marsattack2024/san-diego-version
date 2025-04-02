/**
 * Route Handler Utilities for Next.js 15
 * 
 * This file provides helper functions and patterns for creating consistent route handlers.
 */

import { NextResponse } from 'next/server';
import { ApiResponse, RouteParams, RouteContext } from '../types/route-handlers';
import { edgeLogger } from '../logger/edge-logger';

/**
 * Creates a standardized JSON response
 * 
 * @param data The data to include in the response
 * @param status The HTTP status code (default: 200)
 * @returns A Response object
 */
export function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
    return NextResponse.json(data, { status });
}

/**
 * Creates a success response
 * 
 * @param data The data to include in the response
 * @param status The HTTP status code (default: 200)
 * @returns A Response object
 */
export function successResponse<T>(data: T, status = 200): Response {
    return jsonResponse({
        success: true,
        data
    }, status);
}

/**
 * Creates an error response
 * 
 * @param message The error message
 * @param error The original error (optional)
 * @param status The HTTP status code (default: 500)
 * @returns A Response object
 */
export function errorResponse(message: string, error?: any, status = 500): Response {
    // Log the error
    edgeLogger.error(message, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });

    return jsonResponse({
        success: false,
        error: message // Use the message as the error field to match test expectations
    }, status);
}

/**
 * Creates a validation error response
 * 
 * @param message The validation error message
 * @param details Additional error details (optional)
 * @returns A Response object with 400 status
 */
export function validationError(message: string, details?: any): Response {
    return errorResponse(message, details, 400);
}

/**
 * Creates an unauthorized error response
 * 
 * @param message The unauthorized error message (default: "Unauthorized")
 * @returns A Response object with 401 status
 */
export function unauthorizedError(message = "Unauthorized"): Response {
    return errorResponse(message, null, 401);
}

/**
 * Creates a not found error response
 * 
 * @param message The not found error message (default: "Not found")
 * @returns A Response object with 404 status
 */
export function notFoundError(message = "Not found"): Response {
    return errorResponse(message, null, 404);
}

/**
 * Route handler wrapper with standardized error handling
 * Compatible with Next.js 15 route handlers with dynamic route parameters
 * 
 * IMPORTANT: For non-dynamic routes (without URL parameters), use direct function exports
 * instead as they are more reliable in production builds.
 * 
 * @param handler The route handler function
 * @returns A wrapped handler with error handling
 */
export function withErrorHandling<T extends Record<string, string> = Record<string, never>>(
    handler: (request: Request, context?: RouteContext<T>) => Promise<Response>
) {
    return async (request: Request, context?: RouteContext<T>): Promise<Response> => {
        try {
            return await handler(request, context);
        } catch (error) {
            return errorResponse(
                "An unexpected error occurred",
                error instanceof Error ? error : String(error)
            );
        }
    };
}

/**
 * Templates for creating standard route handlers
 */

/**
 * Template for non-dynamic routes (no URL parameters)
 * 
 * This pattern is more reliable in Next.js 15 production builds.
 */
export const createNonDynamicRouteTemplate = `
/**
 * Route handler for [describe purpose]
 */
import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

export const runtime = 'edge';

export async function GET(request: Request): Promise<Response> {
  try {
    // Logic goes here...
    
    // Return standardized response
    return successResponse({ data: "Your response data" });
  } catch (error) {
    return errorResponse("Specific error message", error);
  }
}
`;

/**
 * Template for dynamic routes (with URL parameters)
 */
export const createDynamicRouteTemplate = `
/**
 * Route handler for [describe purpose]
 */
import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, withErrorHandling } from '@/lib/utils/route-handler';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import type { IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';

export const GET = withErrorHandling(async (
  request: Request,
  { params }: IdParam
): Promise<Response> => {
  try {
    // Extract path params by awaiting the Promise
    const { id } = await params;
    
    // Logic goes here...
    
    // Return standardized response
    return successResponse({ data: "Your response data" });
  } catch (error) {
    return errorResponse("Specific error message", error);
  }
});
`;

// For backward compatibility
export const createRouteTemplate = createDynamicRouteTemplate; 