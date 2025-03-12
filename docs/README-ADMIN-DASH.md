# Admin Dashboard Development Guide

This technical guide explains the architecture, implementation details, and development workflows for the admin dashboard, aimed at developers who need to maintain or extend the system.

## Architecture Overview

The admin dashboard follows a modern full-stack architecture:

```
Client Components ↔ API Routes ↔ Supabase (Auth + Database)
```

Key architectural decisions:
- Complete separation of admin UI from regular user interface
- Server-side authentication checks for all admin routes
- React Query for data fetching and caching
- API-first approach for all admin operations

## Development Environment Setup

### Prerequisites

- Node.js 18+
- Supabase account with service role key
- Local environment variables:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your-project-url
SUPABASE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Installation

```bash
# Install dependencies
npm install

# Run migrations to set up admin database structure
npx supabase db push

# Create your first admin user
npm run setup:first-admin your@email.com

# Start development server
npm run dev
```

## Tech Stack Deep Dive

### Frontend

- **Next.js 14+ (App Router)**: For server components, API routes, and routing
- **React**: UI components and state management
- **TanStack Query (React Query)**: For data fetching, caching, and synchronization
- **TanStack Table**: For advanced data table functionality
- **Zustand**: For global state management
- **shadcn/ui**: Component library based on Radix UI and Tailwind CSS

### Backend

- **Next.js API Routes**: For admin API endpoints
- **Supabase Admin API**: For user management operations
- **PostgreSQL**: For data storage via Supabase
  - Row Level Security (RLS) for access control
  - Database functions for complex operations
  - Triggers for automatic data maintenance

## Code Organization

### Directory Structure Explained

```
/app/admin/                      # Admin UI routes (Next.js App Router)
/app/api/admin/                  # Admin API endpoints
/components/admin/               # Reusable admin UI components
/lib/admin/                      # Admin utility functions and services
/stores/                         # Global state management (Zustand)
/supabase/migrations/            # Database schema and functions
```

### Key Files and Their Purpose

#### Core Configuration

- `app/admin/layout.tsx`: Admin layout with auth check and providers
- `components/admin/features/users/context/users-context.tsx`: User management state
- `lib/admin/api-client.ts`: Centralized API client for admin operations

#### UI Components

- `components/admin/features/users/components/users-table.tsx`: Data table for users
- `components/admin/features/users/components/users-columns.tsx`: Column definitions
- `components/admin/data-table-toolbar.tsx`: Search and filtering UI

#### API Routes

- `app/api/admin/users/route.ts`: List and create users
- `app/api/admin/users/[userId]/route.ts`: Get, update, delete specific user
- `app/api/admin/users/invite/route.ts`: Send invitation to new user
- `app/api/admin/dashboard/route.ts`: Dashboard statistics

## Working with the Admin System

### Adding a New Admin Page

1. Create a new page in `/app/admin/`:

```typescript
// /app/admin/my-feature/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/admin/api-client';

export default function MyFeaturePage() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await adminApi.getMyFeatureData();
        setData(result);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div>
      <h1>My Feature</h1>
      {/* Your UI components */}
    </div>
  );
}
```

2. Add a new API endpoint:

```typescript
// /app/api/admin/my-feature/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: Request) {
  const cookieStore = cookies();
  const cookieList = await cookieStore.getAll();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_KEY!, // Use service role key
    { 
      cookies: {
        getAll() { return cookieList; },
        setAll() { /* implementation */ },
      },
    }
  );
  
  // Verify the user is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if user is an admin
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  try {
    // Fetch data from database
    const { data, error } = await supabase
      .from('your_table')
      .select('*');
      
    if (error) {
      throw error;
    }
    
    return NextResponse.json({ data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

3. Update the API client:

```typescript
// /lib/admin/api-client.ts
export const adminApi = {
  // Existing methods...
  
  getMyFeatureData: async () => {
    const res = await fetch('/api/admin/my-feature');
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch data');
    }
    return res.json();
  },
};
```

4. Add a navigation item in the sidebar:

```typescript
// components/admin/app-sidebar.tsx
const navigationItems = [
  // Existing items...
  {
    title: "My Feature",
    href: "/admin/my-feature",
    icon: IconFeature,
  },
];
```

### Extending User Management

To add a new field to user management:

1. Update the database schema:

```sql
-- /supabase/migrations/add_user_field.sql
ALTER TABLE sd_user_profiles 
ADD COLUMN IF NOT EXISTS new_field TEXT;
```

2. Update TypeScript interfaces:

```typescript
// types/user.ts
interface UserProfile {
  user_id: string;
  full_name: string;
  // Existing fields...
  new_field: string;
}
```

3. Modify the user API endpoint to include the field:

```typescript
// Ensure the field is included in the select
const { data: profiles } = await supabase
  .from('sd_user_profiles')
  .select('*, new_field');
```

4. Update UI components to display and edit the field:

```typescript
// components/admin/features/users/components/users-columns.tsx
export const columns = [
  // Existing columns...
  
  {
    accessorKey: "new_field",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="New Field" />
    ),
    cell: ({ row }) => <div>{row.getValue("new_field") || "-"}</div>,
  },
];
```

## Data Flow and State Management

### Client-Side Data Flow

```
UI Component → React Query Hook → API Client → API Route → Database
```

Example with React Query:

```typescript
// Custom hook for user data
function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: adminApi.getUsers,
    staleTime: 60 * 1000, // 1 minute
  });
}

// In a component
function UsersTable() {
  const { data, isLoading, error } = useUsers();
  
  // Render table with data
}
```

### Server-Side Data Flow

```
API Route → Supabase Client → Database → Response
```

Each API route follows this pattern:
1. Create Supabase client with service role key
2. Verify user authentication and admin status
3. Perform database operations
4. Return formatted response

## Authentication and Authorization

### Admin Authentication Flow

1. User logs in via standard auth flow
2. Middleware intercepts requests to `/admin/*` routes
3. Middleware checks admin status via:
   - User profile's `is_admin` flag (fast check)
   - Database `is_admin()` function (definitive check)
4. If admin, request proceeds; if not, redirects to unauthorized page

### Admin Status Verification

Admin status is verified at multiple levels:

1. **Middleware** (route protection):

```typescript
// middleware.ts
if (user && pathname.startsWith('/admin')) {
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }
}
```

2. **API Routes** (action authorization):

```typescript
// Each admin API route
const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
if (!isAdmin) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

3. **Database** (row-level security):

```sql
-- RLS policies check admin status for sensitive operations
CREATE POLICY "Only admins can view all profiles" ON sd_user_profiles
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM sd_user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

## Database Schema and Functions

### Core Tables

#### sd_user_profiles

```sql
CREATE TABLE sd_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company_name TEXT,
  website_url TEXT,
  company_description TEXT,
  location TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  website_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### sd_user_roles

```sql
CREATE TABLE sd_user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index to prevent duplicate roles
CREATE UNIQUE INDEX idx_user_roles_user_role ON sd_user_roles(user_id, role);
```

### Key Database Functions

#### is_admin

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

#### make_user_admin

```sql
CREATE OR REPLACE FUNCTION make_user_admin(user_email TEXT) RETURNS TEXT AS $$
DECLARE
  uid UUID;
BEGIN
  -- Find the user by email
  SELECT id INTO uid FROM auth.users WHERE email = user_email;
  
  IF uid IS NULL THEN
    RETURN 'User not found';
  END IF;
  
  -- Insert the admin role
  INSERT INTO sd_user_roles (user_id, role) VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Update user profile
  UPDATE sd_user_profiles SET is_admin = TRUE WHERE user_id = uid;
  
  RETURN 'User is now an admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## UI Component System

The admin dashboard uses a component hierarchy:

```
Layout → Page → UI Components → Data Display → Interactive Elements
```

### Data Table Implementation

The user management table uses TanStack Table:

```typescript
// Create table instance
const table = useReactTable({
  data: users,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  onColumnFiltersChange: setColumnFilters,
  onGlobalFilterChange: setGlobalFilter,
  onRowSelectionChange: setRowSelection,
  state: {
    sorting,
    columnFilters,
    globalFilter,
    rowSelection,
  },
});

// Render the table
return (
  <div>
    <div className="flex items-center py-4">
      <DataTableToolbar table={table} />
    </div>
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {/* Table body content */}
        </TableBody>
      </Table>
    </div>
    <DataTablePagination table={table} />
  </div>
);
```

## Error Handling and Logging

### Client-Side Error Handling

React Error Boundaries capture UI errors:

```typescript
// app/admin/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin error:', error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center">
      <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
      <p className="text-gray-600 mb-6">{error.message || 'An error occurred'}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

### API Error Handling

Structured error handling in API routes:

```typescript
try {
  // Operation that may fail
} catch (error) {
  console.error('Error details:', error);
  
  if (error.code === 'P2025') {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }
  
  if (error.code === '23505') {
    return NextResponse.json({ error: 'Duplicate entry' }, { status: 409 });
  }
  
  return NextResponse.json(
    { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
    { status: 500 }
  );
}
```

## Testing

### Unit Testing Components

```typescript
// __tests__/admin/users-table.test.tsx
import { render, screen } from '@testing-library/react';
import { UsersTable } from '@/components/admin/features/users/components/users-table';
import { mockUsers } from '../../mocks/users';

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockUsers,
    isLoading: false,
    error: null,
  }),
}));

describe('UsersTable', () => {
  it('renders user data correctly', () => {
    render(<UsersTable />);
    
    // Check if users are displayed
    expect(screen.getByText(mockUsers[0].full_name)).toBeInTheDocument();
    expect(screen.getByText(mockUsers[0].email)).toBeInTheDocument();
  });
});
```

### API Testing

```typescript
// __tests__/api/admin-users.test.ts
import { createMocks } from 'node-mocks-http';
import { GET } from '@/app/api/admin/users/route';

// Mock Supabase client
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: () => ({ data: { user: { id: 'test-user-id' } } }),
    },
    rpc: () => ({ data: true }), // Mock admin check
    from: () => ({
      select: () => ({
        eq: () => ({ data: [{ /* mock user data */ }], error: null }),
      }),
    }),
  }),
}));

describe('Admin Users API', () => {
  it('returns user data for admin users', async () => {
    const { req } = createMocks({ method: 'GET' });
    const response = await GET(req);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.users).toBeDefined();
    expect(Array.isArray(data.users)).toBe(true);
  });
});
```

## Performance Considerations

### Query Optimization

- Use `select` with specific columns to minimize data transfer
- Add indexes to frequently queried columns:

```sql
CREATE INDEX idx_user_profiles_is_admin ON sd_user_profiles(is_admin);
CREATE INDEX idx_user_roles_role ON sd_user_roles(role);
```

### Caching Strategy

- Use React Query's staleTime to reduce unnecessary fetches:

```typescript
const { data } = useQuery({
  queryKey: ['users'],
  queryFn: adminApi.getUsers,
  staleTime: 60 * 1000, // Cache for 1 minute
});
```

- Implement optimistic updates for better UX:

```typescript
const mutation = useMutation({
  mutationFn: adminApi.deleteUser,
  onMutate: async (userId) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['users'] });
    
    // Snapshot previous value
    const previousUsers = queryClient.getQueryData(['users']);
    
    // Optimistically update to the new value
    queryClient.setQueryData(['users'], (old) => 
      old.filter(user => user.id !== userId)
    );
    
    return { previousUsers };
  },
  onError: (err, newTodo, context) => {
    // If mutation fails, restore previous value
    queryClient.setQueryData(['users'], context.previousUsers);
  },
});
```

## Deployment Considerations

### Environment Variables

Required for production:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Database Migration Strategy

When deploying database changes:

1. Create migration file in `/supabase/migrations/`
2. Test locally with `npx supabase db reset`
3. Deploy to production with `npx supabase db push`

### Security Checklist

- Ensure service role key is not exposed to client
- Verify all admin API endpoints check admin status
- Confirm RLS policies are correctly implemented
- Set appropriate CORS headers for production

## Troubleshooting Guide

### Common Issues and Solutions

#### API 500 Errors

```
Error: Route used `cookies().getAll()`. `cookies()` should be awaited before using its value.
```

**Solution**: Prefetch cookies correctly:

```typescript
const cookieStore = cookies();
const cookieList = await cookieStore.getAll();

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
  {
    cookies: {
      getAll() { return cookieList; },
      // ...
    },
  }
);
```

#### Authentication Issues

```
Error: Failed to fetch user data: Unauthorized
```

**Solution**: Check auth token expiration and middleware:

1. Verify the user is logged in
2. Check admin status in database
3. Ensure middleware correctly evaluates admin privileges

#### Database Errors

```
Error: relation "sd_user_roles" does not exist
```

**Solution**: Run migrations:

```bash
npx supabase db push
```

## Extending the Admin Dashboard

### Adding New Features

To add a complete new feature:

1. Create database table and functions
2. Implement API endpoints
3. Create UI components
4. Add to navigation

### Custom Theming

The admin dashboard supports theme customization:

```typescript
// /app/admin/src/context/theme-context.tsx
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
  // Implementation details
}
```

To modify the theme:
1. Edit `/app/admin/settings/appearance/page.tsx`
2. Update theme options
3. Customize Tailwind theme in `tailwind.config.js`

## API Reference

### Admin API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/dashboard` | GET | Dashboard statistics |
| `/api/admin/users` | GET | List all users |
| `/api/admin/users` | POST | Create a new user |
| `/api/admin/users/[userId]` | GET | Get user details |
| `/api/admin/users/[userId]` | DELETE | Delete a user |
| `/api/admin/users/invite` | POST | Send invitation to new user |
| `/api/admin/users/make-admin` | POST | Make a user an admin |
| `/api/admin/users/revoke-admin` | POST | Revoke admin role |

### Admin Client API

```typescript
adminApi.getUsers(): Promise<User[]>
adminApi.getUser(id: string): Promise<User>
adminApi.inviteUser(email: string): Promise<{ success: boolean }>
adminApi.deleteUser(id: string): Promise<{ success: boolean }>
adminApi.makeAdmin(email: string): Promise<{ success: boolean }>
adminApi.revokeAdmin(email: string): Promise<{ success: boolean }>
adminApi.getDashboardStats(): Promise<DashboardStats>
```

This comprehensive technical documentation should provide developers with all the information they need to understand, maintain, and extend the admin dashboard system.