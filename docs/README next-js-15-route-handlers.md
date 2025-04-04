# Next.js 15 Route Handler Standards

This document outlines the standardized patterns for creating API route handlers in our Next.js 15 application. Adhering to these patterns ensures consistency, maintainability, and leverages our shared utilities.

## Core Requirements & Standards

All route handlers MUST adhere to the following:

1.  **Runtime & Dynamic Behavior**: Declare `export const runtime = 'edge';` and `export const dynamic = 'force-dynamic';` at the top of the file (unless a serverless runtime like `nodejs` is explicitly required for specific reasons like long execution time or incompatible libraries).
2.  **Typing**: Use standard `Request` for the incoming request object and `Promise<Response>` for the return type. **Avoid `NextRequest` and `NextResponse`**.
3.  **CORS Handling**: Wrap **all** returned responses (success or error) using the `handleCors(response, request, true)` utility from `@/lib/utils/http-utils`.
4.  **Response Utilities**: Use the standardized response functions (`successResponse`, `errorResponse`, `unauthorizedError`, `validationError`, `notFoundError`) from `@/lib/utils/route-handler`.
5.  **Supabase Client**:
    *   For routes **requiring authentication**, use the `withAuth` or `withAdminAuth` wrappers. The Supabase client should still be created within the handler using `createRouteHandlerClient()` for database operations.
    *   For **unauthenticated** routes or routes with optional authentication, create the client manually using `createRouteHandlerClient()` from `@/lib/supabase/route-client`.
6.  **Authentication Wrappers**: Use `withAuth` or `withAdminAuth` from `@/lib/auth/with-auth` for routes requiring user authentication. The wrapped handler MUST follow the `AuthenticatedRouteHandler` signature: `async (request: Request, context: RouteContext, user: User) => ...`.
7.  **Dynamic Parameters**:
    *   When using `withAuth`, access dynamic parameters via the `context` object (e.g., `context.params?.id`). **Do not `await params` inside the handler.**
    *   For unauthenticated routes, use the standard Next.js signature (`request: Request, { params }: IdParam`) and `await params` before use (`const { id } = await params;`).
    *   Use standardized parameter types (e.g., `IdParam`, `SlugParam`) from `@/lib/types/route-handlers`.
8.  **Logging**: Utilize `edgeLogger` for structured logging, including `operationId` for traceability.
9.  **Error Handling**: Implement robust `try...catch` blocks, logging errors using `edgeLogger`, and returning standardized error responses via `handleCors`.

## Standard Patterns & Examples

### 1. Authenticated Route (using `withAuth`)

This is the preferred pattern for routes requiring user login.

```typescript
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, validationError, notFoundError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { withAuth, type AuthenticatedRouteHandler, type RouteContext } from '@/lib/auth/with-auth';
import type { IdParam } from '@/lib/types/route-handlers'; // If dynamic params are used
import type { User } from '@supabase/supabase-js';
import { z } from 'zod'; // Example validation

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define the core logic handler matching the AuthenticatedRouteHandler signature
const GET_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
    // context contains { params?: { id?: string, ... }, searchParams?: URLSearchParams }
    const operationId = `auth_get_${Math.random().toString(36).substring(2, 10)}`;
    const chatId = context.params?.id; // Access dynamic params via context (NO await)

    edgeLogger.info('Authenticated GET request started', {
        category: LOG_CATEGORIES.CHAT, // Example category
        operationId,
        userId: user.id,
        chatId // Log dynamic params if used
    });

    if (!chatId) { // Example validation for dynamic route
        const errRes = validationError('Chat ID is required');
        return handleCors(errRes, request, true);
    }

    try {
        const supabase = await createRouteHandlerClient(); // Create client for DB ops

        // Main logic using 'user' and potentially 'chatId'
        const { data, error } = await supabase
            .from('your_table')
            .select('*')
            .eq('user_id', user.id)
            .eq('id', chatId); // Example query

        if (error) {
            edgeLogger.error('Database query error', {
                category: LOG_CATEGORIES.DB,
                operationId,
                error: error.message,
                userId: user.id,
                chatId
            });
            const errRes = errorResponse('Failed to fetch data', error.message, 500);
            return handleCors(errRes, request, true);
        }

        if (!data || data.length === 0) {
            edgeLogger.warn('Data not found', {
                category: LOG_CATEGORIES.DB,
                operationId,
                userId: user.id,
                chatId
            });
            const errRes = notFoundError('Requested data not found');
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Authenticated GET request successful', {
            category: LOG_CATEGORIES.CHAT,
            operationId,
            userId: user.id,
            resultCount: data.length
        });

        const successRes = successResponse({ data });
        return handleCors(successRes, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in authenticated GET handler', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            userId: user.id,
            chatId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            important: true
        });
        const errRes = errorResponse('An unexpected server error occurred', error, 500);
        return handleCors(errRes, request, true);
    }
};

// Wrap the handler logic with the authentication middleware
export const GET = withAuth(GET_Handler);

// Similarly for POST, PUT, DELETE etc. using withAuth or withAdminAuth
// const POST_Handler: AuthenticatedRouteHandler = async (request, context, user) => { ... };
// export const POST = withAuth(POST_Handler);
```

### 2. Unauthenticated Route (or Optional Authentication)

Use this pattern for public endpoints or where authentication is checked manually within the handler.

```typescript
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import type { IdParam } from '@/lib/types/route-handlers'; // If dynamic params are used

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Example: Unauthenticated GET for a dynamic resource
 */
export async function GET(
    request: Request,
    { params }: IdParam // Standard Next.js context for dynamic routes
): Promise<Response> {
    const operationId = `unauth_get_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // MUST await params before use in unauthenticated routes
        const { id } = await params;

        edgeLogger.info('Unauthenticated GET request received', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            resourceId: id,
            url: request.url
        });

        // Optional Authentication Check
        const supabase = await createRouteHandlerClient();
        const { data: { user } } = await supabase.auth.getUser(); // Doesn't throw/error if no user

        if (user) {
            edgeLogger.debug('User is authenticated (optional)', { operationId, userId: user.id });
            // Potentially modify query based on user
        } else {
            edgeLogger.debug('No authenticated user found (optional)', { operationId });
        }

        // Process the request (example: fetch public data)
        const { data, error } = await supabase
            .from('public_table')
            .select('*')
            .eq('id', id)
            .single(); // Example query

        if (error || !data) {
            edgeLogger.error('Error fetching public data or not found', {
                category: LOG_CATEGORIES.DB,
                operationId,
                resourceId: id,
                error: error?.message
            });
            const errRes = errorResponse('Failed to fetch resource', error?.message || 'Not found', error ? 500 : 404);
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Unauthenticated GET request successful', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            resourceId: id
        });

        const successRes = successResponse({ data });
        return handleCors(successRes, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in unauthenticated GET handler', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            important: true
        });
        const errRes = errorResponse('An unexpected server error occurred', error, 500);
        return handleCors(errRes, request, true);
    }
}

// Similarly for POST, PUT, DELETE etc.
```

## Migration Notes

*   **`NextRequest` / `NextResponse`**: Actively migrate any remaining usages to standard `Request` / `Promise<Response>`.
*   **Dynamic Params**: Ensure dynamic params are accessed correctly (`context.params` in `withAuth`, `await params` otherwise).
*   **CORS**: Ensure `handleCors` wraps every response.
*   **Authentication**: Prefer the `withAuth` wrapper over manual `getUser()` checks where authentication is mandatory.

## Serverless Routes

These routes intentionally use the `nodejs` runtime and **do not** follow the edge standard:

*   `app/api/perplexity/route.ts` - Requires libraries/features not available in edge.
*   `app/api/profile/update-summary/route.ts` - Longer execution time needed.
*   `app/api/agent-chat/route.ts` - Complex operations potentially exceeding edge limits.

For these specific routes, `export const runtime = 'nodejs';` should be used. CORS and response utilities should still be applied.

## Resources

*   [Standard Route Handler Template](/docs/route-handler-template.ts)
*   [Authentication Wrappers](/lib/auth/with-auth.ts)
*   [Response & CORS Utilities](/lib/utils/route-handler.ts), [/lib/utils/http-utils.ts](/lib/utils/http-utils.ts)
*   [Supabase Client Utility](/lib/supabase/route-client.ts)
*   [Route Parameter Types](/lib/types/route-handlers.ts)
*   [Next.js Route Handlers Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
