# Next.js 15 Route Handler Standards (Effective: April 4, 2025 - Pattern B)

## Overview

This document defines the **required standard (Pattern B - Direct Export)** for implementing API route handlers (`app/api/.../route.ts`) in our Next.js 15 application. Adhering to this pattern ensures build compatibility, consistency, maintainability, security, and proper error handling across our API routes.

**Note:** An earlier attempt (Pattern A) used `withAuth`/`withAdminAuth` wrappers. This pattern caused persistent build errors related to Next.js 15 type checking for Higher-Order Components used as route exports and is **deprecated**. All routes requiring authentication MUST now use Pattern B with manual checks.

## Core Requirements (Apply to ALL Routes)

All API route handlers MUST follow these requirements:

1.  **Runtime & Dynamic Settings**
    ```typescript
    export const runtime = 'edge';
    export const dynamic = 'force-dynamic';
    ```
    *(Unless a `nodejs` runtime is explicitly required for specific reasons like incompatible libraries or long execution times, e.g., `api/perplexity`, `api/profile/update-summary`).*

2.  **Standard Types & Exports**
    *   Use standard Web API types: `Request` for incoming requests and `Promise<Response>` for return types.
    *   **Use direct function exports** for HTTP methods (`export async function GET(...)`, `export async function POST(...)`, etc.).
    *   Route files MUST NOT export anything other than the handler functions and the required Next.js config constants (`runtime`, `dynamic`, `maxDuration`). Internal types or schemas should not be exported.
    *   Avoid using `NextRequest` and `NextResponse` except where strictly necessary (e.g., specific middleware interactions not applicable here).

3.  **CORS Handling**
    *   Wrap **every** returned `Response` object (success or error) using `handleCors(response, request, true)` from `@/lib/utils/http-utils`.

4.  **Response Utilities**
    *   Use standardized response functions from `@/lib/utils/route-handler` for creating response bodies:
        *   `successResponse(data)`
        *   `errorResponse(message, details, statusCode)`
        *   `unauthorizedError(message)` (Defaults to 401)
        *   `validationError(message, details?)`
        *   `notFoundError(message)`

5.  **Logging**
    *   Use `edgeLogger` from `@/lib/logger/edge-logger` for all logging operations.
    *   Include a unique `operationId` and relevant context (`category`, `userId`, etc.) in all log entries.
    *   Remove any `console.log` statements.

6.  **Error Handling**
    *   Implement `try...catch` blocks covering the main logic of each handler.
    *   Log errors comprehensively using `edgeLogger`, including stack traces for unexpected errors.
    *   Return standardized error responses using the response utilities, wrapped with `handleCors`.

7.  **Supabase Client**
    *   Always create the Supabase client manually within the handler using `createRouteHandlerClient()` from `@/lib/supabase/route-client`.
    *   Use `createRouteHandlerAdminClient()` only when service role privileges are explicitly required (e.g., title generation bypassing RLS).

## Standard Pattern (Pattern B - Direct Export)

This is the **only** approved pattern for implementing API route handlers.

### Key Implementation Steps:

1.  **Direct Export:** Define handlers using `export async function METHOD(...)`.
2.  **Signature:**
    *   For routes without dynamic parameters: `(request: Request): Promise<Response>`
    *   For routes with dynamic parameters: `(request: Request, { params }: SpecificParamType): Promise<Response>` (e.g., `IdParam` from `@/lib/types/route-handlers`).
3.  **Authentication Check (If Required):**
    *   Perform authentication manually at the beginning of the handler:
        ```typescript
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            // Log warning
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }
        const userId = user.id; // Use the authenticated user
        ```
4.  **Admin Check (If Required):**
    *   Perform *after* the standard authentication check:
        ```typescript
        const isAdmin = user.app_metadata?.is_admin === true;
        if (!isAdmin) {
            // Log warning
            const errRes = errorResponse('Admin access required', 'Forbidden', 403);
            return handleCors(errRes, request, true);
        }
        ```
5.  **Parameter Handling (If Dynamic Route):**
    *   **You MUST `await params`** before accessing parameter values.
        ```typescript
        // Signature: { params }: IdParam 
        // Inside handler:
        const resolvedParams = await params; // Await the destructured promise
        const chatId = resolvedParams.id;
        if (!chatId) { // Validate after awaiting
            const errRes = validationError('Chat ID is required');
            return handleCors(errRes, request, true);
        }
        ```
6.  **Core Requirements:** Apply all core requirements (runtime, dynamic, CORS, response utils, logging, error handling, client creation).

### Example: Authenticated Dynamic Route (GET /api/items/[id])

```typescript
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError, notFoundError, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import type { IdParam } from '@/lib/types/route-handlers'; // Use specific type
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import type { User } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: IdParam // Use specific type
): Promise<Response> {
    const operationId = `get_item_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // 1. Manual Auth Check
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication required for GET item', { operationId, error: authError?.message });
            const errRes = unauthorizedError('Authentication required');
            return handleCors(errRes, request, true);
        }
        const userId = user.id;

        // 2. Await and Validate Params
        const resolvedParams = await params;
        const itemId = resolvedParams.id;

        if (!itemId) {
            const errRes = validationError('Item ID is required');
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Fetching item details', { operationId, itemId: itemId.slice(0, 8), userId: userId.substring(0, 8) });

        // 3. Main Logic (DB Query with RLS)
        const { data, error: dbError } = await supabase
            .from('items') // Example table
            .select('*')
            .eq('id', itemId)
            .eq('user_id', userId) // RLS should enforce this too
            .maybeSingle();

        if (dbError) {
            edgeLogger.error('Error fetching item', { operationId, itemId: itemId.slice(0, 8), error: dbError.message });
            const errRes = errorResponse('Failed to fetch item', dbError);
            return handleCors(errRes, request, true);
        }

        if (!data) {
            edgeLogger.warn('Item not found or unauthorized', { operationId, itemId: itemId.slice(0, 8), userId: userId.substring(0, 8) });
            const errRes = notFoundError('Item not found');
            return handleCors(errRes, request, true);
        }

        edgeLogger.info('Successfully fetched item details', { operationId, itemId: itemId.slice(0, 8) });
        // 4. Return Success Response (wrapped with CORS)
        const response = successResponse({ item: data });
        return handleCors(response, request, true);

    } catch (error) {
        // 5. Catch Unexpected Errors (wrapped with CORS)
        edgeLogger.error('Unexpected error in GET item handler', { operationId, error: error instanceof Error ? error.message : String(error), important: true });
        const errRes = errorResponse('Unexpected error fetching item', error, 500);
        return handleCors(errRes, request, true);
    }
}
```

## Conclusion

Using the **Pattern B (Direct Export)** standard with manual authentication checks and careful parameter handling is mandatory for all API routes to ensure compatibility with the Next.js 15 build process and maintain consistency across the codebase. Remember to apply all core requirements, especially CORS wrapping and standardized response utilities.
