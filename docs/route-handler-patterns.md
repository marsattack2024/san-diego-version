# Route Handler Patterns in Next.js 15

This document outlines the standardized patterns for route handlers in our Next.js 15 application, with specific focus on handling dynamic routes and message fetching.

## Standard Route Handler Pattern

All route handlers should follow these standard patterns to ensure consistency across the codebase.

**Base Pattern (Without Authentication Wrapper):**

```typescript
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import type { IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Route handler description (Example: Dynamic GET)
 */
export async function GET(
    request: Request,
    { params }: IdParam // Standard Next.js context
): Promise<Response> {
    const operationId = `operation_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
        const { id } = await params;
        
        // Manual Authentication (if not using withAuth)
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return handleCors(unauthorizedError(), request, true);
        }
        
        // Main logic using 'user'...
        
        const response = successResponse(data);
        return handleCors(response, request, true);
    } catch (error) {
        const response = errorResponse('Error message', error, 500);
        return handleCors(response, request, true);
    }
}

**Pattern for Handlers Wrapped with `withAuth`:**

When a route requires authentication, use the `withAuth` (or `withAdminAuth`) wrapper from `@/lib/auth/with-auth`. The handler function itself should then be defined with the following signature, receiving the validated `user` object as the third argument:

```typescript
import { type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import { type User } from '@supabase/supabase-js';
// ... other imports ...

// Note the signature: (request, context, user)
const GET_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
    const { params } = context; // params might be undefined if not a dynamic route
    const operationId = `operation_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
        const id = params?.id; // Access params via context if needed
        
        // Authentication is handled by the wrapper, 'user' is guaranteed valid.
        edgeLogger.info('Authenticated request', { operationId, userId: user.id });
        
        // Main logic using 'user'...
        const supabase = await createRouteHandlerClient(); // Still need client for DB ops
        const { data, error } = await supabase.from('your_table').select('*').eq('user_id', user.id);
        // ... handle data/error ...
        
        const response = successResponse(data);
        return handleCors(response, request, true);
    } catch (error) {
        const response = errorResponse('Error message', error, 500);
        return handleCors(response, request, true);
    }
};

// Wrap the handler
export const GET = withAuth(GET_Handler);
```

## Key Requirements for Dynamic Routes

When working with dynamic routes (e.g., `app/api/chat/[id]/route.ts`):

1.  **Use Parameter Types**: Import and use types like `IdParam` from `@/lib/types/route-handlers` for the context object: `async function GET(request: Request, { params }: IdParam, user: User)`.
2.  **Await `params`**: Always `await params` before accessing properties like `id`: `const { id } = await params;`. (Note: This was standard before Next.js 15 shifted context structure slightly, but accessing `params` from the context passed to the handler does not require `await`). Access dynamic params directly via `context.params?.id`.
3. **Add Operation IDs**: Include unique operation IDs in logs for traceability
4. **Apply CORS Consistently**: Use `handleCors` for all responses
5. **Use Comprehensive Error Handling**: Include detailed error logging
6. **Mark Routes as Dynamic**: Include `export const dynamic = 'force-dynamic'`

## Message Fetching Routes

For routes that fetch chat messages, follow these specific patterns:

1. **Pagination**: Include proper pagination with `page` and `pageSize` parameters
2. **Content Transformation**: Convert database records to appropriate message format
3. **Error Validation**: Include validation for required parameters (chatId, page, pageSize)
4. **Response Format**: Use consistent message object format with `id`, `role`, `content`, `createdAt`
5. **Detailed Logging**: Log message counts and sample content for debugging

## Error Handling

All route handlers should use standardized error responses:

```typescript
// Authentication errors
return handleCors(unauthorizedError(), request, true);

// Not found errors
return handleCors(notFoundError('Resource not found'), request, true);

// Validation errors
return handleCors(errorResponse('Invalid input', errors, 400), request, true);

// Server errors
return handleCors(errorResponse('Server error', error, 500), request, true);
```

## CORS Handling

CORS headers should be applied to all responses:

```typescript
// Success response with CORS
const response = successResponse(data);
return handleCors(response, request, true);

// Error response with CORS
const response = errorResponse('Error message', error, 500);
return handleCors(response, request, true);
```

## Testing Routes

When testing routes, verify:

1. Parameter extraction is done correctly
2. Authentication is properly handled
3. Error responses include CORS headers
4. Successful responses include expected data format
5. Error cases are handled gracefully

## Implementation Examples

### Chat Message Fetching Route

```typescript
export async function GET(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    const operationId = `messages_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
        // Extract params safely by awaiting the Promise
        const { id: chatId } = await params;

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '100');

        // Authentication and database query...

        // Transform database records to Message format
        const messages = data.map((record: any) => ({
            id: record.id,
            role: record.role,
            content: record.content,
            createdAt: record.created_at,
            toolsUsed: record.tools_used
        }));

        // Return success response with CORS headers
        const response = successResponse(messages);
        return handleCors(response, request, true);
    } catch (error) {
        // Error handling...
    }
}
```

### Message Count Route

```typescript
export async function GET(
    request: Request,
    { params }: IdParam
): Promise<Response> {
    const operationId = `count_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
        // Extract params safely by awaiting the Promise
        const { id: chatId } = await params;

        // Count messages...

        // Return success response with CORS headers
        const response = successResponse({ count });
        return handleCors(response, request, true);
    } catch (error) {
        // Error handling...
    }
}
```

## Client-Side Fetching Best Practices

When fetching from these routes in client components:

1. Use cache-busting query parameters to prevent stale data
2. Add detailed error handling with informative messages
3. Log API responses for debugging
4. Verify store updates are completed successfully
5. Include operation IDs for tracing requests end-to-end

Example:
```typescript
// Use cache busting and set headers
const response = await fetch(`/api/chat/${chatId}?_=${Date.now()}`, {
  cache: 'no-store',
  headers: {
    'Cache-Control': 'no-cache'
  }
});

// Check for successful response
if (!response.ok) {
  throw new Error(`Error ${response.status}: ${await response.text()}`);
}

// Parse and validate the response
const data = await response.json();
``` 