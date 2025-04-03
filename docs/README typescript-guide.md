# TypeScript Guide for Next.js 15

This document outlines the TypeScript setup and best practices for our Next.js 15 application, updated to reflect our standardized authentication patterns.

## Local Type Checking

To check types locally without deploying to Vercel:

```bash
# Basic type check (detects errors but doesn't emit files)
npm run typecheck

# Watch mode for continuous type checking during development
npm run typecheck:watch
```

## Next.js 15 Type Patterns

### API Route Handlers

For Next.js 15 route handlers, use the following pattern:

```typescript
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } } // Use standard destructuring
): Promise<Response> {
  // Access parameters directly
  const slug = params.slug;
  
  // Your code here
  
  return NextResponse.json({ data: 'example' });
}
```

Key points:
- Use standard `Request` and `NextResponse` from `next/server`.
- Params are passed as objects, not Promises.
- Explicitly type the return as `Promise<Response>`.
- Use `{ params }: { params: { paramName: string } }` for type safety.

### Page Components with Dynamic Parameters

For page components with dynamic parameters:

```typescript
// app/items/[slug]/page.tsx
export default async function ItemPage({ 
  params 
}: { 
  params: { slug: string } 
}) {
  // Your code here
  return <div>Item: {params.slug}</div>;
}
```

## Cookie Handling with `@supabase/ssr`

The `@supabase/ssr` library now handles the complexities of cookie management for authentication. We no longer need manual cookie handling for Supabase auth tokens.

- **Server Components & Route Handlers**: Use `cookies()` from `next/headers` and pass the store to the Supabase client creator.
- **Middleware**: The `createMiddlewareClient` handles cookie reading/writing automatically when you call `supabase.auth.getUser()` or `getSession()`.
- **Client Components**: `createBrowserClient` handles cookies automatically in the browser.

```typescript
// Server Component Example
import { createClient } from '@/utils/supabase/server';

export default async function ServerComponent() {
  const supabase = await createClient(); // Uses cookies() internally
  const { data } = await supabase.from('items').select('*');
  // ...
}
```

## Missing Components and Features

When you encounter imports for components or features that have been removed (like the old circuit breaker):

1.  **Remove Deprecated Imports**: Delete imports for components that no longer exist (e.g., `CircuitBreakerDebug`).
2.  **Refactor Dependent Code**: Update components that used the removed features to use the new patterns (e.g., components that called `historyService.getCircuitState` should be updated or removed).
3.  **Verify Functionality**: Ensure the refactored components still work as expected without the removed dependencies.

## Error Handling in Loggers

Always type errors properly in logger calls:

```typescript
// Correct
logger.error('Error occurred', { 
  error: error instanceof Error ? error.message : String(error),
  // Include stack trace for better debugging if available
  stack: error instanceof Error ? error.stack : undefined 
});
```

## Pre-commit Hooks

We use Husky and lint-staged to check TypeScript before commits:

- All TypeScript files are checked with `npm run typecheck`.
- Staged files are linted with ESLint.

## VS Code Configuration

Our VS Code workspace is configured for optimal TypeScript experience:

- Uses the project's TypeScript version.
- Enables automatic imports with non-relative paths (`@/`).
- Auto-formats on save.
- Runs ESLint fix on save.

## Common Issues and Solutions

1.  **Route Handler Parameter Issues**: Ensure correct destructuring and typing (`{ params }: { params: { ... } }`).
2.  **Missing Return Types**: Explicitly type function return values, especially `Promise<Response>` for route handlers.
3.  **Type Imports**: Use `import type { ... }` for types.
4.  **Auth Errors**: Ensure the correct Supabase client is used for the context (server/client/route) and that RLS policies are correctly configured.
5.  **`cookies()` Usage**: Remember `cookies()` is async in Server Components/Route Handlers and must be awaited when passed to the Supabase client creator.

## Pre-build Safety

The project includes a prebuild script that runs TypeScript checking automatically:

```bash
npm run build # Automatically runs typecheck first
```

## Resources

- [Next.js 15 TypeScript Documentation](https://nextjs.org/docs/app/building-your-application/configuring/typescript)
- [TypeScript Official Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [@supabase/ssr Documentation](https://supabase.com/docs/guides/auth/server-side-rendering) 