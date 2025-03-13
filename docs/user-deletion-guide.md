# User Deletion Guide

This document explains how user deletion works in the system and provides guidance for administrators on how to properly delete users.

## Tables and Views Involved in User Deletion

The following database objects contain user-related data:

### Tables (with user_id foreign keys)
1. `auth.users` - The main Supabase authentication table (requires special permissions)
2. `sd_user_profiles` - User profile information
3. `sd_user_roles` - User role assignments (including admin status)
4. `sd_chat_sessions` - User chat sessions
5. `sd_chat_histories` - Chat message history (linked to chat sessions)
6. `sd_audit_logs` - Audit trail for tracking admin actions

### Views (read-only)
1. `user_stats` - View that shows user statistics
2. `orphaned_user_data` - View that helps identify orphaned records

## Normal User Deletion Flow

When an admin deletes a user through the admin dashboard:

1. The system first deletes the user's profile data from all application tables
2. Then it attempts to delete the user from the `auth.users` table
3. All operations are logged in the `sd_audit_logs` table for tracking

## How to Delete Users

### Method 1: Using the Admin Dashboard (Recommended)

The most user-friendly way to delete users:

1. Log in as an administrator
2. Navigate to the Admin Dashboard
3. Go to the Users section
4. Find the user you want to delete
5. Click the delete action from the user's menu
6. Confirm the deletion

### Method 2: Using Database Functions

For more control or when the UI method doesn't work, you can use SQL functions:

```sql
-- Option 1: Try to delete everything including auth record
SELECT complete_user_deletion('user-id-here');

-- Option 2: Just delete application data (safer)
SELECT safe_delete_user_data('user-id-here');

-- Option 3: Only delete from auth.users (requires admin privileges)
SELECT admin_delete_auth_user('user-id-here');

-- Check if user exists in various tables
SELECT * FROM does_user_exist('user-id-here');
```

### Method 3: Manual SQL Deletion (Last Resort)

If all else fails, you can manually delete with these SQL commands:

```sql
-- Step 1: Delete from application tables
DELETE FROM sd_user_roles WHERE user_id = 'user-id-here';
DELETE FROM sd_user_profiles WHERE user_id = 'user-id-here';
DELETE FROM sd_chat_sessions WHERE user_id = 'user-id-here';

-- Step 2: Delete from auth.users (requires admin privileges)
DELETE FROM auth.users WHERE id = 'user-id-here';
```

Note: You cannot directly delete from `user_stats` or `orphaned_user_data` as these are views, not tables.

## Common Errors and Solutions

| Error | Solution |
|-------|----------|
| "User not allowed" | Set `SUPABASE_KEY` environment variable with the service role key |
| "Relation sd_audit_logs does not exist" | Run the migration to create the audit logs table |
| User profile deleted but auth record remains | Use `admin_delete_auth_user` function |
| "Permission denied" errors | Make sure you're logged in as an admin with proper permissions |
| User still appears in some tables | Run the `does_user_exist` function to see which tables, then delete manually |

## Best Practices

1. **Use Proper Cascade Deletes**: When creating new tables with user data, always add `REFERENCES auth.users(id) ON DELETE CASCADE` to user ID foreign keys.

2. **Audit All Deletions**: Always record user deletions in the audit log table.

3. **Check Before Deleting**: Use the `does_user_exist` function to verify where user data exists before deletion.

4. **Handle Auth Users Separately**: Remember that deleting from `auth.users` requires special permissions.

5. **Test Thoroughly**: After deleting a user, verify they're fully removed from all tables.