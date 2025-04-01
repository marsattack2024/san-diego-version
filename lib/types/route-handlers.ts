/**
 * Route Handler Type Definitions for Next.js 15
 * 
 * This file provides standardized type definitions for route handlers
 * to ensure consistency across the application.
 */

/**
 * Route Parameter Type with dynamic segments as Promise
 * 
 * In Next.js 15, dynamic route parameters must be awaited before accessing
 */
export type RouteParams<T extends Record<string, string>> = {
    params: Promise<T>;
};

/**
 * Route Handler Context - combines request and params
 */
export type RouteContext<T extends Record<string, string>> = {
    request: Request;
    params: RouteParams<T>;
};

/**
 * Common dynamic route parameter patterns
 */
export type IdParam = RouteParams<{ id: string }>;
export type SlugParam = RouteParams<{ slug: string }>;
export type UserIdParam = RouteParams<{ userId: string }>;

/**
 * Route Handler Type - defines the signature for route handlers
 */
export type RouteHandler<T extends Record<string, string> = {}> =
    (request: Request, params: RouteParams<T>) => Promise<Response>;

/**
 * Common route handler types
 */
export type GetHandler<T extends Record<string, string> = {}> = RouteHandler<T>;
export type PostHandler<T extends Record<string, string> = {}> = RouteHandler<T>;
export type PutHandler<T extends Record<string, string> = {}> = RouteHandler<T>;
export type PatchHandler<T extends Record<string, string> = {}> = RouteHandler<T>;
export type DeleteHandler<T extends Record<string, string> = {}> = RouteHandler<T>;

/**
 * Utility types for response formatting
 */
export type ApiResponse<T> = {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
};

/**
 * Common response generators
 */
export const createApiResponse = <T>(data: T): ApiResponse<T> => ({
    success: true,
    data
});

export const createApiError = (message: string, error?: any): ApiResponse<never> => ({
    success: false,
    message,
    error: error instanceof Error ? error.message : String(error)
}); 