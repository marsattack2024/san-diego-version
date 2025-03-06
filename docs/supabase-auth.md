# Supabase Authentication Implementation

This document outlines the implementation of Supabase authentication in our Next.js application.

## Overview

Our authentication system uses Supabase Auth with the following features:
- Email/password authentication
- Magic link authentication (passwordless)
- Protected routes with middleware
- Server-side session validation

## Implementation Details

### Authentication Flow

1. **Login**: Users can sign in using either:
   - Email and password
   - Magic link (passwordless)

2. **Session Management**: 
   - Sessions are managed via cookies
   - Middleware refreshes tokens automatically
   - Protected routes redirect to login if no session exists

3. **Redirects**:
   - Authenticated users are redirected to `/chat` after login
   - Unauthenticated users are redirected to `/login` when accessing protected routes
   - Magic link authentication redirects through `/auth/callback`

### Key Components

#### Client Utilities
- `lib/supabase/client.ts`: Browser client for client-side authentication
- `lib/supabase/server.ts`: Server client for server-side authentication

#### Authentication Components
- `components/auth/login-form.tsx`: Login form with email/password and magic link options

#### Routes
- `app/(auth)/login/page.tsx`: Login page
- `app/auth/callback/route.ts`: Callback handler for magic link authentication

#### Middleware
- `middleware.ts`: Handles authentication state and protects routes

## User Management

Since this is a closed system, user accounts are created by administrators directly in the Supabase dashboard. To create a new user account:

1. Log in to the Supabase dashboard
2. Navigate to Authentication > Users
3. Click "Add User"
4. Enter the user's email and password
5. Click "Create User"

Users can then log in with the provided credentials or use the magic link option.

## Usage

### Protected Routes

The following routes are protected and require authentication:
- `/chat`
- `/settings`

To add more protected routes, update the `protectedPaths` array in `middleware.ts`.

### Authentication State

To access the current user in server components:

```typescript
import { createServerClient } from '@/lib/supabase/server';

export default async function ProtectedPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  return <div>Hello, {user.email}</div>;
}
```

To access the current user in client components:

```typescript
'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useState } from 'react';

export function ProfileComponent() {
  const [user, setUser] = useState(null);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    
    getUser();
  }, []);
  
  return user ? <div>Hello, {user.email}</div> : <div>Loading...</div>;
}
```

### Signing Out

To sign a user out:

```typescript
const handleSignOut = async () => {
  await supabase.auth.signOut();
  router.refresh();
  router.push('/login');
};
```

## Environment Variables

The following environment variables are required:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

For server-side operations, you may also need:

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Customization

### Email Templates

To customize the email templates for magic links and password resets, use the Supabase Dashboard:
1. Go to Authentication > Email Templates
2. Modify the templates as needed

### Redirect URLs

To add additional redirect URLs for magic links:
1. Go to Authentication > URL Configuration
2. Add your redirect URLs to the allowed list
