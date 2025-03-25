# Supabase Authentication Import Paths

## Correct Import Paths

When working with Supabase authentication in this project, make sure to use the correct import paths:

```typescript
// ✅ CORRECT IMPORTS
import { createClient } from '@/utils/supabase/client'; // For browser client
import { createClient as createServerClient } from '@/utils/supabase/server'; // For server client
import { createAdminClient } from '@/utils/supabase/server'; // For admin operations with service role
```

```typescript
// ❌ INCORRECT IMPORTS (will cause errors)
import { createClient } from '@/lib/supabase/client';
import { createServerClient } from '@/lib/supabase/server';
import { createBrowserClient } from '../supabase/client';
```

## Path Structure

The Supabase authentication utilities are located in the `/utils/supabase/` directory:

- `/utils/supabase/client.ts` - Browser client for client components
- `/utils/supabase/server.ts` - Server client for server components, API routes
- `/utils/supabase/middleware.ts` - Middleware implementation for refreshing tokens
- `/utils/supabase/auth-provider.tsx` - React context provider for authentication

## Common Issues

### 1. Incorrect Import Paths

When you see errors like:
```
Module not found: Can't resolve '@/lib/supabase/server'
```

This indicates that the import path is incorrect. The right one is:
```typescript
import { createClient as createServerClient } from '@/utils/supabase/server';
```

### 2. Function Name Differences

Note that the server client exports a function named `createClient`, not `createServerClient`:

```typescript
// ✅ CORRECT
import { createClient as createServerClient } from '@/utils/supabase/server';

// ❌ INCORRECT 
import { createServerClient } from '@/utils/supabase/server';
```

### 3. Admin Operations

For operations that need to bypass Row Level Security (RLS), use the admin client:

```typescript
import { createAdminClient } from '@/utils/supabase/server';

// Usage
const supabaseAdmin = createAdminClient();
```

## Inline Authentication Helper

If you need to authenticate a user in an API route, you can use this pattern:

```typescript
async function getAuthenticatedUser(request?: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      return { user, serverClient: supabase, errorResponse: null };
    }
    
    return { 
      user: null, 
      serverClient: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  } catch (error) {
    console.error('Authentication error', error);
    return {
      user: null,
      serverClient: null,
      errorResponse: NextResponse.json({ error: 'Authentication error' }, { status: 500 })
    };
  }
}
```

## Cookie Handling Best Practices

Always use `getAll()` and `setAll()` methods for cookie handling as shown in the server.ts file. Never use individual `get`/`set`/`remove` methods as they are deprecated.