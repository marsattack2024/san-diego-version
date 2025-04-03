# Cookie Standardization and Authentication Persistence

## Problem Statement

Our application previously had inconsistent cookie handling across different parts of the codebase, leading to authentication issues like sessions not persisting and inconsistent auth states.

## Solution: Standardized Cookie Handling with `@supabase/ssr`

We have standardized cookie handling across the entire application by adopting the `@supabase/ssr` library's built-in mechanisms and creating consistent client utilities.

### Core Principles:

1.  **`@supabase/ssr` Library**: This library is now the single source of truth for managing session cookies and authentication tokens. It handles refreshing tokens automatically.
2.  **Consistent Client Utilities**: We use standardized functions (`utils/supabase/client.ts`, `utils/supabase/server.ts`, `utils/supabase/route-client.ts`, `middleware.ts`) to create Supabase clients. These utilities internally use the correct cookie handling methods provided by `@supabase/ssr` for their respective environments (browser, server components, route handlers, middleware).
3.  **Middleware Responsibility**: The primary role of `middleware.ts` is now session validation and refresh using `supabase.auth.getUser()`, ensuring cookies are updated correctly on the response. It also handles redirects for unauthenticated users accessing protected routes.
4.  **Secure Cookie Attributes**: While `@supabase/ssr` handles the core auth cookies, we ensure other application cookies (like `x-is-admin`, `x-session-health` set previously in middleware) use secure attributes (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). *(Note: The streamlined middleware now sets fewer custom cookies, relying more on headers and JWT claims)*.

## Implementation Status

✅ **COMPLETED**: Cookie handling has been standardized across the application.

### Key Changes Implemented:

1.  **Removed Custom Cookie Utility**: The custom `lib/supabase/cookie-utils.ts` is no longer necessary for *auth* cookies, as `@supabase/ssr` handles this. It might still be used for *other* application cookies if needed, but the core auth persistence relies on the library.
2.  **Updated Middleware**: `middleware.ts` now uses `createServerClient` (configured for middleware context) from `@supabase/ssr` which handles cookie reading/writing automatically as part of session refresh (`getUser()`).
3.  **Updated Client Utilities**: All client creation utilities in `utils/supabase/` now correctly pass the appropriate cookie handlers (`cookies()` from `next/headers` or browser context) to the respective `@supabase/ssr` client creation functions.
4.  **Removed Redundant Logic**: Eliminated manual cookie setting/getting for auth tokens in different parts of the application.

## Session Health Indicators

While the complex custom cookie handling was removed, the refactored middleware still sets informative headers on the response (`x-auth-ready`, `x-auth-state`, `x-is-admin`) which client components can inspect if needed for diagnostics or state updates, although relying on the `onAuthStateChange` listener is generally preferred for reacting to auth changes. The `x-session-health` cookie approach was likely removed or simplified during the middleware refactor in favor of direct session validation.

## Troubleshooting Authentication Persistence

If you encounter issues where login state isn't persisting:

1.  **Check Middleware Configuration**: Ensure `middleware.ts` is correctly configured with the right `matcher` to run on protected routes. Verify it uses `await supabase.auth.getUser()` to trigger session refresh and cookie updates.
2.  **Verify Client Initialization**: Confirm that the correct Supabase client (`createBrowserClient`, `createServerComponentClient`, etc.) is being used in the appropriate context (Client Component, Server Component, etc.).
3.  **Inspect Browser Cookies**: Use browser dev tools to check if the `sb-*-auth-token` cookies are being set correctly by the middleware responses. Ensure they have appropriate `Path`, `HttpOnly`, `Secure`, and `SameSite` attributes.
4.  **Clear Browser Cache/Cookies**: Sometimes stale cookies can interfere. Clear site data and try again.
5.  **Review RLS Policies**: Ensure Row Level Security policies in Supabase are correctly configured, as data access issues might sometimes be mistaken for authentication problems.
