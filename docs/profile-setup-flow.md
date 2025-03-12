# User Profile Setup Flow

This document explains how the user profile setup process works in the San Diego project.

## Overview

The profile setup system ensures new users are prompted to complete their profile before accessing the application. This provides essential context about the user's business for AI interactions.

## Technical Implementation

### Profile Flow Diagram

```
Login → Auth Callback → Redirect to /chat → Middleware Profile Check → Redirect to /profile (if needed)
```

### Key Components

1. **Auth Callback (`app/auth/callback/route.ts`)**
   - Processes authentication after a user logs in
   - Redirects users to `/chat` after successful login
   - Does not check if user has a profile

2. **Middleware Profile Check (`middleware.ts`)**
   - Runs when a user accesses `/chat/*` routes
   - Checks if user has an existing profile in `sd_user_profiles` table
   - Redirects to `/profile` if no profile exists
   - Uses header caching (`x-has-profile`) to optimize subsequent requests

3. **Profile Page (`app/profile/page.tsx`)**
   - Server component that fetches user profile data
   - Determines if it's a first login based on profile existence
   - Passes this context to the client component

4. **Profile Form (`components/profile-form.tsx`)**
   - Client component for profile creation/editing
   - Different UI for first-time setup vs. profile updates
   - Handles website summary generation if URL provided
   - Redirects first-time users to `/chat` after setup

### Database Structure

The `sd_user_profiles` table includes:
- `user_id` (foreign key to Supabase auth.users)
- `full_name`
- `company_name`
- `website_url`
- `company_description`
- `location`
- `website_summary`
- `created_at`
- `updated_at`
- `is_admin` (for admin privileges)

## User Flow in Detail

### First-Time Login

1. User completes authentication via email link
2. Auth callback redirects to `/chat`
3. Middleware checks for profile existence:
   - Queries `sd_user_profiles` table for the user's ID
   - If no profile found, redirects to `/profile`
4. Profile page displays first-time setup form
5. User completes required fields
6. On submission:
   - Profile is created in the database
   - If website URL provided, a website summary is generated
   - User is redirected to `/chat`

### Subsequent Logins

1. User completes authentication
2. Auth callback redirects to `/chat`
3. Middleware checks for profile existence:
   - Finds existing profile
   - Sets `x-has-profile: true` header
   - Allows access to `/chat`
4. Future requests use the cached header to skip database queries

### Optimization Techniques

- Header caching (`x-has-profile`) prevents repeated database queries
- Error handling in middleware defaults to allowing access rather than creating redirect loops
- React's `cache()` function in `lib/supabase/server.ts` deduplicates Supabase client creation

## Potential Issues

1. **Header Caching**: If `x-has-profile` header gets incorrectly set to `true`, it may bypass profile checks
2. **Error Handling**: Errors during profile check default to allowing access
3. **Timing Issues**: First request after login might not have auth fully established
4. **Zustand Auth Store**: Loads profile but doesn't handle redirection logic

## Debugging Tips

If profile redirects aren't working:
1. Check browser network tab for middleware redirects
2. Verify database has proper tables and schema
3. Look for `Debug: No profile found, redirecting to profile setup` logs
4. Clear browser cookies/localStorage to test first-time flow
5. Verify middleware `x-has-profile` header values

## Key Code Locations

- Auth Callback: `app/auth/callback/route.ts`
- Middleware Profile Check: `middleware.ts` (lines 175-218)
- Profile Page: `app/profile/page.tsx`
- Profile Form: `components/profile-form.tsx`
- Database Schema: `lib/db/schema.ts`
- Auth Store: `stores/auth-store.ts`