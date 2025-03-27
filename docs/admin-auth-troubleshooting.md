# Admin Authentication Troubleshooting Guide

This document provides a comprehensive guide to diagnose and fix admin authentication issues in the application, particularly related to the widget page not appearing properly in the admin dashboard.

## Root Causes and Solutions

There are several potential causes for admin page issues:

### 1. Missing `x-is-admin` Header

**Problem:** The middleware was not setting the `x-is-admin` header needed by the admin API routes.

**Solution:** We've updated `utils/supabase/middleware.ts` to:
- Check if the user is an admin via multiple methods (RPC function, profile check, roles check)
- Set the `x-is-admin` header for both request and response
- Use the Supabase service role key if available to bypass RLS restrictions

### 2. Row Level Security (RLS) Issues

**Problem:** In production, RLS policies might prevent client-side admin checks from working.

**Solution:**
1. Use the SQL script in `scripts/fix-rls-policies.sql` to:
   - Diagnose existing RLS policies
   - Add missing policies to let users check their own admin status
   - Fix the `is_admin` function to use `SECURITY DEFINER`
   - Grant proper execute permissions

2. Apply these SQL changes in the Supabase SQL Editor in your production instance.

### 3. Client-Side Auth Store

**Problem:** The client auth store's `checkAdminRole()` was failing in production due to RLS issues.

**Solution:** We've enhanced `stores/auth-store.ts` to:
- Add more detailed logging
- Implement multiple fallback strategies
- Try the API endpoint as a last resort
- Handle RLS-related errors gracefully

### 4. Configuration Issues

**Problem:** The widget page had configuration issues with module syntax.

**Solution:**
- Removed `app/admin/widget/route.config.js` with CommonJS syntax
- Added export configuration directly in the page component using ESM syntax

## Verification Steps

After deploying the changes, verify the fixes with these steps:

1. **Check Browser Console:**
   - Look for `[updateSession]` logs showing admin status checks
   - Verify `[Widget Admin]` logs from the component
   - Confirm `[Admin Middleware]` logs showing header validations

2. **Examine Network Requests:**
   - Check API requests to `/api/admin/dashboard` and other admin endpoints
   - Verify the presence of the `x-is-admin: true` header
   - Look for any 403 errors that might still be occurring

3. **Check Supabase RLS Policies:**
   - Run the diagnostic sections of `scripts/fix-rls-policies.sql` in Supabase SQL Editor
   - Ensure the `is_admin` function exists and has `SECURITY DEFINER`
   - Verify RLS policies allow users to read their own profile and roles

4. **Test Widget Page Access:**
   - Clear browser cache and cookies
   - Navigate to `/admin/widget` directly
   - Check if the API test in the widget page succeeds

## Additional Configurations

### Service Role Key

For secure admin checks, add the Supabase service role key to your environment variables:

```
SUPABASE_KEY=your-service-role-key
```

This allows middleware and server components to bypass RLS restrictions when checking admin status.

### Environment-Specific Debugging

In `vercel.json`, you can add debugging configuration:

```json
{
  "env": {
    "ADMIN_DEBUG": "true"
  }
}
```

## Common Error Messages and Fixes

### "Forbidden - Admin access required"

This error from admin API routes indicates the `x-is-admin` header is missing or false.

**Fix:**
- Check if user actually has admin privileges in Supabase
- Verify the middleware admin check is working correctly
- Check RLS policies for the admin tables

### RPC Function Errors

Errors like "permission denied for function is_admin" indicate RLS issues.

**Fix:**
- Run the SQL script to fix the `is_admin` function with `SECURITY DEFINER`
- Grant proper execute permissions to authenticated users

### Row Level Security Errors

Errors like "new row violates row-level security policy" indicate RLS policy issues.

**Fix:**
- Add appropriate RLS policies to allow users to read their own data
- Use the SQL script to diagnose and fix RLS policies

## Upgrading to Use Service Role for Admin Checks

For better security and reliability, always use the service role key for admin checks:

1. Add the service role key to environment variables:
   ```
   SUPABASE_KEY=your-service-role-key
   ```

2. Create a dedicated admin client in server components:
   ```typescript
   const adminClient = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_KEY!,
     { /* cookie options */ }
   );
   ```

3. Use this admin client for all admin-related operations:
   ```typescript
   const { data, error } = await adminClient.rpc('is_admin', { uid: user.id });
   ```

This approach bypasses RLS restrictions entirely for admin checks.

## Related Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Functions with SECURITY DEFINER](https://supabase.com/docs/guides/database/functions#security-definer-vs-security-invoker)
- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware) 