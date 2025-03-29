# Admin Authentication System

This document explains the admin authentication system used in the application, which follows a simplified approach with a single source of truth.

## Architecture Overview

Our admin authentication system follows these principles:

1. **Single Source of Truth**: The `sd_user_profiles.is_admin` boolean flag is the authoritative source for admin status.
2. **Performance Optimization**: We use the `x-is-admin` cookie to cache admin status during a session.
3. **Minimal Database Queries**: We check the database only when necessary (session start, cookie expiration, or accessing admin pages).

## How Admin Authentication Works

### Middleware Layer

When a user makes a request:

1. The middleware (`/utils/supabase/middleware.ts`) runs first, checking the user's authentication status.
2. If authenticated, it checks for admin status using this prioritized flow:
   - Check if a valid `x-is-admin` cookie exists with a valid timestamp.
   - If not, query the `sd_user_profiles` table directly to check the `is_admin` flag.
3. The admin status is saved in the `x-is-admin` cookie with a 24-hour expiration.
4. The cookie is refreshed every 30 minutes when needed.

### Client-Side Checking

The client-side code (`stores/auth-store.ts`) checks admin status using:

1. First check the `x-is-admin` cookie (most efficient).
2. If no cookie exists, check the profile in the current application state.
3. If neither source is available, make an API request to `/api/auth/admin-status`.

### API Endpoint

The `/api/auth/admin-status` endpoint:

1. Uses a service role key to bypass RLS restrictions.
2. Queries the `sd_user_profiles` table for the `is_admin` flag.
3. Returns a JSON response with the admin status.
4. Includes appropriate cache headers to reduce repeated checks.

## How to Add Admin Users

### Using SQL in Supabase Dashboard

You can run the following SQL in the Supabase dashboard SQL editor:

```sql
-- Find the user ID first
SELECT id, email FROM auth.users WHERE email = 'user@example.com';

-- Update the profile to set admin status
UPDATE sd_user_profiles 
SET is_admin = TRUE 
WHERE user_id = 'user_id_from_previous_query';

-- If no profile exists, create one
INSERT INTO sd_user_profiles (user_id, full_name, is_admin)
VALUES ('user_id_here', 'User Name', TRUE)
ON CONFLICT (user_id) DO UPDATE SET is_admin = TRUE;
```

### Using the Make Admin Script

We provide a Node.js script to make a user an admin:

```bash
# Navigate to the scripts directory
cd scripts

# Run the script with the user's email
node make-admin.js user@example.com
```

The script will:
1. Find the user by email
2. Update their profile with `is_admin = true`
3. Also add an entry in the `sd_user_roles` table for backward compatibility

### Using the Admin Panel (Future)

In the future, we plan to add an admin management interface in the admin panel.

## Syncing Admin Status

If you ever need to synchronize the admin status between `sd_user_profiles` and the legacy `sd_user_roles` table, run the SQL script in `scripts/sync-admin-status.sql`:

```bash
# Connect to your Supabase database
psql -h your-database-host -U postgres -d postgres

# Run the script
\i scripts/sync-admin-status.sql
```

Or copy and paste the script into the Supabase SQL Editor.

## Troubleshooting

### Admin Navigation Not Showing

If you're an admin but don't see the admin navigation:

1. First check your cookies: Look for the `x-is-admin` cookie in your browser's developer tools.
2. Check the database: Verify `is_admin` is TRUE in the `sd_user_profiles` table for your user.
3. Check the middleware logs: Look for logs containing `[updateSession]` to confirm admin status check.
4. Clear browser cookies and refresh: This will force a fresh admin check.

### Database Verification

You can verify admin status in the database with this query:

```sql
SELECT 
  auth.users.email,
  profiles.is_admin,
  CASE WHEN roles.role IS NOT NULL THEN TRUE ELSE FALSE END AS has_admin_role
FROM auth.users
LEFT JOIN sd_user_profiles profiles ON auth.users.id = profiles.user_id
LEFT JOIN (
  SELECT user_id, role FROM sd_user_roles WHERE role = 'admin'
) roles ON auth.users.id = roles.user_id
WHERE profiles.is_admin = TRUE 
   OR roles.role IS NOT NULL
ORDER BY auth.users.email;
```

### Logs to Check

When troubleshooting admin authentication, look for these logs:

- `[updateSession] Checking admin status for: ...` - Middleware checking status
- `[updateSession] User is admin via profile check` - Successful admin verification
- `[updateSession] Using cached admin status from cookie (true)` - Using cached status
- `Admin check: ...` - Client-side admin checks in auth store

## FAQ

**Q: Why not use Supabase's native role system instead?**
A: Our approach gives us more control and performance benefits by reducing checks to the auth server.

**Q: Do I need to add a user to both tables?**
A: No, the `sd_user_profiles.is_admin` flag is the single source of truth. The middleware and scripts handle syncing with the legacy roles table.

**Q: How often is admin status checked?**
A: On initial authentication, then every 30 minutes or when accessing admin-specific pages.

**Q: Do admin users need to log out and back in to get admin access?**
A: Sometimes. If you just granted admin privileges, the user may need to log out and back in, or wait for the middleware to refresh their session. 