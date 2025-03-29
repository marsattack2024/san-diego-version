# User Creation and Management Flow

This document explains how user creation, invitation, and profile management works in the San Diego project.

## Overview

The user management system has two key components:
1. **Authentication Users** - Managed in Supabase's `auth.users` table
2. **User Profiles** - Custom data stored in `sd_user_profiles` table

## User Creation Flow

### When an Admin Invites a User

1. Admin uses the "Invite User" button in the admin dashboard
2. The system calls `/api/admin/users/invite` endpoint
3. Supabase creates the user in `auth.users` table and sends an invitation email
4. A placeholder profile is automatically created in `sd_user_profiles` with minimal data:
   - `user_id`: The Supabase auth ID
   - `full_name`: Derived from email (first part capitalized)
   - `company_name`: "Pending Setup"
   - `company_description`: "Pending profile completion"
5. The user appears immediately in the admin dashboard with placeholder data

### When a User Accepts an Invitation

1. User clicks the invitation link in their email
2. The user is authenticated and logged in
3. Middleware detects they have a minimal profile but need to complete it
4. User is redirected to the profile setup page
5. User completes their profile with real information
6. Profile is updated with complete business information

## Database Structure

### Key Tables

1. **auth.users** (Supabase Auth)
   - Standard Supabase auth table
   - Contains email, password hash, and authentication data

2. **sd_user_profiles**
   - `user_id` (PK, references auth.users)
   - `full_name`
   - `company_name`
   - `company_description`
   - `website_url`
   - `location`
   - `website_summary`
   - `is_admin`
   - `created_at`
   - `updated_at`

3. **sd_user_roles**
   - `id` (PK)
   - `user_id` (references auth.users)
   - `role` (e.g., "admin")
   - `created_at`

## Admin Dashboard

The admin dashboard lists users from the `sd_user_profiles` table, showing:
1. User's name and company
2. Email (from auth data)
3. Admin status (from both `sd_user_profiles.is_admin` and `sd_user_roles`)
4. Actions: View details, Make admin, Delete user

## Profile Completion Flow

1. When a user logs in, the middleware checks if they have a complete profile
2. If they have only a placeholder profile, they are redirected to the profile setup page
3. Once they complete their profile, the placeholder values are replaced with real data
4. The `website_summary` is generated if they provide a website URL

## Implementation Details

### User Invitation (app/api/admin/users/invite/route.ts)

```typescript
// Create minimal placeholder profile for the user
const { error: profileError } = await supabase
  .from('sd_user_profiles')
  .insert([{
    user_id: data.user.id,
    full_name: userName,
    company_name: 'Pending Setup',
    company_description: 'Pending profile completion',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }]);
```

### User Profile Detection (middleware.ts)

The middleware first checks metadata, then the database to determine if a user has a complete profile:

```typescript
// First check the auth metadata
const hasProfileMetadata = user.user_metadata?.has_profile === true;

// If not, check the database
const { data: profile } = await supabase
  .from('sd_user_profiles')
  .select('user_id, company_name, company_description')
  .eq('user_id', user.id)
  .single();

// Check if this is a real profile or just a placeholder
const isPlaceholder = profile && 
  profile.company_name === 'Pending Setup' && 
  profile.company_description === 'Pending profile completion';

// Redirect to profile setup if needed
if (!profile || isPlaceholder) {
  return NextResponse.redirect(new URL('/profile', request.url));
}
```

## User Deletion

When a user is deleted:
1. The admin dashboard calls `/api/admin/users/[userId]` with DELETE method
2. The API deletes the user from auth.users
3. Cascade triggers delete the profile from sd_user_profiles
4. Cascade triggers delete any roles from sd_user_roles

## Admin Role Management

Admin roles are managed in two places:
1. The `sd_user_roles` table with role = 'admin'
2. The `is_admin` flag in `sd_user_profiles`

Checking admin status:
```sql
CREATE OR REPLACE FUNCTION is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sd_user_roles 
    WHERE user_id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Troubleshooting

### User Not Appearing in Admin Dashboard

If a user doesn't appear in the admin dashboard:
1. Check if they exist in auth.users
2. Verify they have a record in sd_user_profiles
3. If they're in auth but not in profiles, manually create a profile

**Update (2025):** We've improved the admin dashboard to display all users from sd_user_profiles, regardless of whether they have matching auth data. The email field is now stored directly in the profile table as well as in auth.users for redundancy. This ensures that all users with profile records will appear in the dashboard.

### User Can't Access Admin Area

If a user should be an admin but can't access admin pages:
1. Check sd_user_roles table for admin role
2. Verify is_admin flag in sd_user_profiles
3. Use the make_admin RPC function to grant admin rights