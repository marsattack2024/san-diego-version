# Admin System Fixes

This document explains the changes made to fix issues in the admin system.

## Problem 1: Admin Dashboard 403 Errors

The admin dashboard API (`/api/admin/dashboard`) was returning 403 Forbidden errors in production, even though the user was properly authenticated and had admin privileges. The issue didn't occur in other admin routes like `/api/admin/users`.

### Root Causes

1. **Inconsistent Admin Checking**: The dashboard route had a simplified admin check that only used the RPC function and had no fallbacks.

2. **Different Cookie Handling**: The dashboard route was using an async version of the cookie handler while the users route was using a synchronous version.

3. **No Error Logging**: The dashboard route didn't have sufficient error logging to diagnose issues.

4. **Hardcoded Admin IDs**: The users route worked because it had a fallback to hardcoded admin IDs, but this is not a sustainable solution.

### Solution Implemented

1. **Comprehensive Admin Check Function**: Updated the `isAdmin` function in the dashboard route to check for admin status using three methods:
   - RPC function call (`is_admin`)
   - Direct check in `sd_user_profiles` table for `is_admin` flag
   - Direct check in `sd_user_roles` table for 'admin' role

2. **Fixed Cookie Handling**: Removed the async/await from the cookie handler to be consistent with working routes.

3. **Added Detailed Logging**: Added comprehensive logging to track the admin verification process and help diagnose issues.

4. **Eliminated Hardcoded Admin IDs**: Replaced hardcoded admin ID checks with proper database checks.

5. **Created Database Migration**: Added a migration (20240703_improve_admin_checks.sql) that:
   - Updates the `is_admin` function to check both tables
   - Synchronizes admin flags between `sd_user_profiles` and `sd_user_roles` tables
   - Adds diagnostic functions to help troubleshoot admin authentication

## Problem 2: User Deletion Errors

When attempting to delete users in the admin panel, errors were occurring with code 500 and the message "ERROR: relation \"sd_audit_logs\" does not exist (SQLSTATE 42P01)".

### Root Causes

1. **Missing Audit Logs Table**: Supabase was trying to log user deletion to an audit table that doesn't exist.

2. **Async API Issues**: The route was using Next.js APIs incorrectly, causing runtime warnings.

3. **User Authorization**: User deletion was failing because the admin API calls were not using the service role key properly.

### Solution Implemented

1. **Created Audit Logs Table**: Added a new migration (20240704_create_audit_logs.sql) that:
   - Creates the missing `sd_audit_logs` table
   - Adds a `safe_delete_user` function for reliable user deletion

2. **Fixed Next.js API Usage**: Updated the route to properly use async cookies and params handling.

3. **Improved Error Handling**: Added detailed error handling and logging to better diagnose issues.

4. **Service Role Key**: Ensured the route uses the Supabase service role key for admin operations.

5. **Fallback Deletion Mechanism**: Implemented a multi-stage deletion process that handles failures gracefully.

## How to Apply the Fix

1. Deploy the updated code to production.

2. Run both Supabase migration files to update the database:
   ```bash
   # Using Supabase CLI
   supabase db push --db-url=YOUR_SUPABASE_DB_URL
   
   # or manually run the SQL files from the Supabase Dashboard
   ```

3. Ensure the `SUPABASE_KEY` environment variable is set with the service role key.

4. Monitor the logs for any issues with admin authentication or user deletion.

## Preventing Future Issues

1. **Admin User Setup**: Always ensure admin users have both:
   - A record in `sd_user_roles` with role='admin'
   - The `is_admin=true` flag in their `sd_user_profiles` record

2. **Consistent Authentication**: Use the same authentication patterns across all admin routes.

3. **Proper Next.js API Usage**: Follow Next.js best practices for dynamic routes and async operations.

4. **Environment Variables**: Ensure all required environment variables exist in production.

5. **Detailed Logging**: Maintain comprehensive logging in sensitive operations.

## Testing the Fix

To verify the fixes are working:

1. Log in as an admin user
2. Access the admin dashboard and verify it loads correctly
3. Attempt to delete a test user through the admin panel
4. Check the logs for detailed operation information
5. Verify all tables are properly cleaned up after user deletion

If issues persist, SQL functions like `list_all_admins()` and `safe_delete_user()` can help diagnose and fix problems.