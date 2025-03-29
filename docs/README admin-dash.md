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
| `/api/admin/users/revoke-admin` | POST | Revoke admin role |

### Admin Client API

```typescript
adminApi.getUsers(): Promise<User[]>
adminApi.getUser(id: string): Promise<User>
adminApi.inviteUser(email: string): Promise<{ success: boolean }>
adminApi.deleteUser(id: string): Promise<{ success: boolean }>
adminApi.revokeAdmin(email: string): Promise<{ success: boolean }>
adminApi.getDashboardStats(): Promise<DashboardStats>
```

This comprehensive technical documentation should provide developers with all the information they need to understand, maintain, and extend the admin dashboard system.

# Admin Dashboard System Documentation

This comprehensive documentation explains how the admin dashboard system works, covering user setup, interface, features, and technical implementation details for developers.

## 1. System Overview

The admin dashboard is a secure, role-based administration interface that allows authorized users to:

- View system statistics and user activity
- Manage users (invite, view, promote, delete)
- Configure system settings
- Access specialized admin functions

The system uses Supabase for authentication and data storage, with Next.js App Router for the frontend.

## 2. Admin Setup and Access

### Setting Up Your First Admin User

When first deploying the application, you must designate an initial admin user:

1. Register a standard user account through normal signup
2. Configure environment variables:
   ```
   SUPABASE_URL=your-project-url
   SUPABASE_KEY=your-service-role-key (not the anon key)
   ```
3. Run the setup script:
   ```bash
   npm run setup:first-admin your@email.com
   ```

### Admin Access Control

The system enforces admin access through:

1. **Middleware Protection**:
   - All routes under `/admin/*` are protected
   - Checks admin status through both profile flag and roles table
   - Redirects unauthorized users to `/unauthorized`

2. **Role Verification**:
   - Admin API endpoints double-check admin status
   - RLS policies enforce database-level access control 
   - Admin status is stored redundantly for reliability

## 3. Admin Dashboard Interface

### Dashboard Layout

The admin interface consists of:

- **Sidebar Navigation**: Access to all admin sections
- **Header**: User info, notifications, theme controls
- **Main Content Area**: Section-specific content
- **Modal Dialogs**: For actions like user invitation, deletion

### Main Sections

#### Dashboard Home (`/admin`)

The home dashboard presents:
- User statistics (total users, admins, active users)
- System activity metrics
- Recent user activities
- Quick action buttons

#### Users Management (`/admin/users`)

The user management interface allows:
- Viewing all users with search and filtering
- Inviting new users via email
- Viewing detailed user information
- Granting/revoking admin privileges
- Deleting user accounts

#### Settings (`/admin/settings`)

Settings sections include:
- Account settings
- Appearance settings (themes, UI preferences)
- System configuration

## 4. Technical Implementation

### File Structure

```
/app/admin/                      # Next.js App Router admin pages
├── layout.tsx                   # Admin layout with navigation
├── page.tsx                     # Dashboard homepage
├── error.tsx                    # Error boundary component
├── users/                       # User management section
│   ├── components/              # User-specific components
│   │   └── users-adapter.tsx    # Data transformation
│   └── page.tsx                 # Users listing page
├── settings/                    # Settings section
│   ├── page.tsx                 # Settings landing page
│   ├── account/page.tsx         # Account settings
│   └── appearance/page.tsx      # Appearance settings
└── unauthorized/page.tsx        # Unauthorized access page

/app/api/admin/                  # Admin API endpoints
├── dashboard/route.ts           # Dashboard statistics
├── users/                       # User management APIs
│   ├── route.ts                 # List all users
│   ├── [userId]/route.ts        # Single user operations
│   ├── invite/route.ts          # User invitation
│   ├── make-admin/route.ts      # Grant admin role
│   └── revoke-admin/route.ts    # Revoke admin role

/components/admin/               # Reusable admin components
├── features/                    # Feature-specific components
│   └── users/                   # User management components
│       ├── components/          # User interface components
│       │   ├── users-columns.tsx # Table column definitions
│       │   └── users-table.tsx   # User data table
│       ├── context/             # Context providers
│       └── data/                # Data schemas and types

/lib/admin/                      # Admin utilities and services
└── api-client.ts                # API client for admin endpoints

/stores/                         # State management
└── auth-store.ts                # Authentication store with admin state

/supabase/migrations/            # Database structure
├── add_admin_role.sql           # Admin role setup
└── ensure_cascade_deletes.sql   # Data integrity rules
```

### Key Technologies

- **Frontend**: Next.js 14+ (App Router), React, TailwindCSS, shadcn/ui
- **State Management**: Zustand, React Query
- **Backend**: Next.js API routes, Supabase Admin API
- **Database**: PostgreSQL via Supabase with RLS policies

### Authentication Flow

1. Users authenticate through standard application login
2. The middleware checks admin status for protected routes
3. Admin status is determined through:
   - The `is_admin` flag in user profiles (fast check)
   - The `is_admin()` database function (definitive check)
4. Admin privileges grant access to the dashboard and API endpoints

### User Management Features

#### 1. User Listing and Search

The users page (`/admin/users`) retrieves data from `/api/admin/users`:

```javascript
// In app/admin/users/page.tsx
const fetchUsers = async () => {
  setIsLoading(true);
  try {
    const response = await fetch('/api/admin/users');
    const data = await response.json();
    setUsers(data.users || []);
    // Handle pagination, sorting, filtering
  } catch (err) {
    // Error handling
  } finally {
    setIsLoading(false);
  }
};
```

The API endpoint (`/app/api/admin/users/route.ts`) fetches user data from:
- `sd_user_profiles` table for profile information
- `auth.users` table for auth details when available
- `sd_user_roles` table for role information

##### Data Flow and Field Mapping

The user data flows through the system as follows:

1. **Database Layer**: 
   - `auth.users` contains basic user information (email, created_at, last_sign_in_at)
   - `sd_user_profiles` contains extended profile data (full_name, company_name, website_url, etc.)
   - `sd_user_roles` contains role assignments (admin status)

2. **API Layer** (`/app/api/admin/users/route.ts`):
   - Fetches users from `auth.users` using `supabase.auth.admin.listUsers()`
   - Fetches profiles from `sd_user_profiles` using `supabase.from('sd_user_profiles').select('*')`
   - Maps auth users to their profiles using string comparison of IDs
   - Combines data into a unified user object with all necessary fields:
   
   ```javascript
   return {
     user_id: authUser.id,
     full_name: profile ? profile.full_name : (authUser.user_metadata?.name || "Unknown Name"),
     email: authUser.email,
     is_admin: profile ? (profile.is_admin === true || profile.is_admin === 'true') : false,
     company: profile ? profile.company_name : "No profile",
     has_profile: !!profile,
     // Include auth user's created_at
     created_at: authUser.created_at || (profile ? profile.created_at : null),
     // Include all profile fields if available
     ...(profile ? {
       company_name: profile.company_name,
       website_url: profile.website_url,
       company_description: profile.company_description,
       location: profile.location,
       updated_at: profile.updated_at,
       website_summary: profile.website_summary
     } : {}),
     // Include auth user fields
     last_sign_in_at: authUser.last_sign_in_at
   };
   ```

3. **Frontend Layer** (`/app/admin/users/page.tsx`):
   - Receives the combined user objects from the API
   - Displays user information in a table with columns for name, email, ID, created date, and admin status
   - Shows company information under the user's name
   - Provides a detailed view dialog that shows all user information

##### Important Implementation Details

1. **Field Mapping**: 
   - The API returns both `company` (a processed field) and `company_name` (the raw database field)
   - The frontend should check both fields: `{user.company || user.company_name || 'No company information'}`
   - Similar approach for other fields that might have multiple sources

2. **Type Handling**:
   - `is_admin` can be a boolean or string ('true'/'false'), so comparisons should handle both:
   ```javascript
   user.is_admin === true || user.is_admin === 'true'
   ```

3. **Date Formatting**:
   - Dates from the database need to be properly formatted for display:
   ```javascript
   {user.created_at ? new Date(user.created_at).toLocaleString() : '-'}
   ```

4. **User ID Comparison**:
   - When matching auth users to profiles, always use string comparison:
   ```javascript
   profiles?.find(p => String(p.user_id) === String(authUser.id))
   ```

5. **Fallback Values**:
   - Always provide fallbacks for missing data:
   ```javascript
   full_name: profile ? (profile.full_name || authUser.user_metadata?.name || "Unknown Name") : (authUser.user_metadata?.name || "Unknown Name")
   ```

#### 2. User Invitation System

The invitation flow uses Supabase's `inviteUserByEmail` method:

```javascript
// In /app/api/admin/users/invite/route.ts
const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
```

This process:
1. Creates a new user in `auth.users`
2. Generates a magic link with a secure token
3. Sends an invitation email to the address
4. When clicked, directs to password setup
5. After first login, middleware directs to profile setup

#### 3. User Detail View

User details are displayed in a modal dialog showing:
- Account information (email, ID, signup date)
- Profile data (name, company, location)
- Admin status
- Actions (make admin, delete)

The UI components are defined in `/components/admin/features/users/` and use a React Context for state management.

#### 4. Admin Role Management

Admin role assignment happens through:

```javascript
// In /app/api/admin/users/make-admin/route.ts
const { data, error } = await supabase.rpc('make_user_admin', { user_email: email });
```

The database function:
1. Adds a record to `sd_user_roles` with role='admin'
2. Sets `is_admin=true` in the user's profile
3. Returns success/failure message

#### 5. User Deletion

User deletion is handled by:

```javascript
// In /app/api/admin/users/[userId]/route.ts
const { error } = await supabase.auth.admin.deleteUser(userId);
```

This process:
1. Removes the user from `auth.users`
2. Cascading deletes propagate to:
   - `sd_user_profiles`
   - `sd_user_roles`
   - `sd_chat_sessions`
   - `sd_chat_histories`
   - Any other tables with foreign key relationships

### Dashboard Statistics

The dashboard stats are fetched from `/api/admin/dashboard`:

```javascript
// In /app/api/admin/dashboard/route.ts
// Get user count
const { count: userCount } = await supabase
  .from('sd_user_profiles')
  .select('*', { count: 'exact', head: true });

// Get chat count
const { count: chatCount } = await supabase
  .from('sd_chat_histories')
  .select('*', { count: 'exact', head: true });

// Get admin count
const { count: adminCount } = await supabase
  .from('sd_user_roles')
  .select('*', { count: 'exact', head: true })
  .eq('role', 'admin');
```

### Database Structure

The admin system relies on these key tables:

1. **auth.users** - Core authentication table (managed by Supabase)
   - Contains email, hashed password, and metadata
   - Primary source of user identity

2. **sd_user_profiles** - Extended user information
   - `user_id` links to `auth.users.id` with `ON DELETE CASCADE`
   - Contains `full_name`, `company_name`, and profile data
   - Includes `is_admin` boolean flag for admin status

3. **sd_user_roles** - Role assignments for permissions
   - Links `user_id` to `auth.users.id` with `ON DELETE CASCADE`
   - Used for 'admin' role and potentially other roles
   - Each role is a separate row for flexibility

4. **sd_chat_sessions & sd_chat_histories** - User content
   - Linked to users with cascading references
   - Contains the actual application data

Database functions handle special operations:
- `is_admin(uid)` - Checks admin status
- `make_user_admin(email)` - Grants admin role
- `revoke_admin(email)` - Removes admin role
- `complete_user_deletion(uid)` - For manual deletion scenarios

## 5. State Management

### Auth Store

The `auth-store.ts` manages authentication state:

```javascript
// In /stores/auth-store.ts
interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // More fields and methods...
  
  checkAdminRole: () => Promise<boolean>;
  adminDeleteUser: (userId: string) => Promise<{ success: boolean, error?: string }>;
}
```

This store:
- Tracks user authentication state
- Caches profile information
- Maintains admin status
- Provides admin-specific methods

### Query Management

React Query handles data fetching and caching:

```javascript
// In /app/admin/layout.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10 * 1000, // 10s
    },
  },
});

export default function AdminLayout({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Layout components */}
    </QueryClientProvider>
  );
}
```

## 6. UI Components

The admin UI uses these key component types:

### Layout Components

- `app/admin/layout.tsx` - Main admin layout
- `components/admin/app-sidebar.tsx` - Navigation sidebar
- `components/admin/header.tsx` - Top navigation bar

### Data Display Components

- `components/admin/users-table.tsx` - User listing with advanced features
- `components/admin/data-table-column-header.tsx` - Sortable column headers
- `components/admin/data-table-pagination.tsx` - Table pagination

### Interactive Components

- Dialog modals for user actions
- Forms for data input
- Confirmation alerts for destructive actions

All components are built with shadcn/ui's accessible component library, which is based on Radix UI primitives and styled with Tailwind CSS.

## 7. Security Considerations

### Authentication Security

- Uses Supabase Auth with JWT tokens
- Admin checks occur at multiple levels:
  - Middleware (route protection)
  - API endpoints (action authorization)
  - Database (row-level security)

### API Security

- Admin API uses service role key, never exposed to client
- All endpoints verify admin status before operations
- Rate limiting prevents abuse
- Input validation prevents injection attacks

### Data Security

- Row Level Security (RLS) enforces access control at the database
- Foreign key constraints maintain data integrity
- Cascading deletes prevent orphaned records

## 8. Troubleshooting

### Common Issues

#### Access Problems

```
Error: Unauthorized access or Forbidden (403)
```

Check:
- User has admin role in `sd_user_roles`
- `is_admin` flag is set in profile
- Middleware is correctly evaluating admin status

#### API Errors

```
Error: cookies().getAll() should be awaited
```

Check:
- The API route properly prefetches cookies:
  ```javascript
  const cookieStore = cookies();
  const cookieList = await cookieStore.getAll();
  // Use cookieList in Supabase client creation
  ```

#### User Management Issues

For invitation failures:
- Verify service role key (SUPABASE_KEY) is set
- Check Supabase email templates
- Ensure proper error handling

For deletion problems:
- Verify cascade delete relationships
- Check for locks or constraints
- Use the manual deletion fallback

For user data display issues:
- **Field Mapping Problems**: If user profile data (company, website, etc.) appears in the main list but not in the detailed view:
  - Ensure the API is returning both processed fields (`company`) and raw database fields (`company_name`)
  - Check that the frontend is looking for both field names: `{user.company || user.company_name || 'No company information'}`
  - Verify that all profile fields are being included in the API response

- **Admin Status Issues**: If admin status isn't correctly reflected:
  - Check both the `sd_user_profiles.is_admin` flag and `sd_user_roles` table
  - Ensure the `is_admin` RPC function is working correctly
  - Remember that `is_admin` can be a boolean or string, so use `user.is_admin === true || user.is_admin === 'true'`

- **Missing Profile Data**: If users appear without profiles:
  - Verify that the profile creation process completed successfully
  - Check for ID mismatches between `auth.users.id` and `sd_user_profiles.user_id`
  - Use string comparison when matching IDs: `String(profile.user_id) === String(authUser.id)`
  - Add the "Create Profile" button functionality to generate missing profiles

- **Row Level Security (RLS) Issues**: If admin users can't see all profiles:
  - Ensure RLS policies are correctly configured to allow admins to view all profiles
  - Use the service role key for admin operations to bypass RLS
  - Check for recursive RLS policies that might cause infinite loops
  - Consider adding fallback admin IDs for emergency access

## 9. Best Practices for Admin Dashboard Development

### Data Flow Best Practices

When working with the admin dashboard, follow these best practices to ensure smooth data flow:

1. **Complete Data Transfer**: 
   - Always include all necessary fields from the database in the API response
   - Use spread operators to include all profile fields: `...(profile ? { ...profile } : {})`
   - Include both processed fields (e.g., `company`) and raw fields (e.g., `company_name`)

2. **Robust Field Access**:
   - Always use fallback patterns when accessing fields: `user.field || user.alternative_field || 'Default'`
   - Handle both boolean and string representations of boolean values
   - Use optional chaining to prevent null reference errors: `user?.field`

3. **ID Handling**:
   - Always use string comparison when matching IDs: `String(id1) === String(id2)`
   - Be aware that UUIDs may have different case or formatting in different contexts
   - Log ID comparisons when debugging matching issues

4. **Type Safety**:
   - Define comprehensive TypeScript interfaces for all data structures
   - Include optional fields with proper types: `field?: string`
   - Handle potential type variations: `is_admin: boolean | string`

### Frontend Component Best Practices

1. **Consistent Field Access**:
   - Use the same field access patterns across all components
   - Extract common field access logic into helper functions
   - Document field mappings in comments

2. **Detailed View Components**:
   - Always check for both processed and raw fields
   - Format dates consistently: `new Date(date).toLocaleString()`
   - Provide meaningful fallbacks for missing data

3. **Error Handling**:
   - Display user-friendly messages for common errors
   - Log detailed error information for debugging
   - Provide retry mechanisms for transient failures

4. **Performance Considerations**:
   - Minimize unnecessary re-renders with memoization
   - Use virtualization for long lists of users
   - Implement pagination for large datasets

## 10. Future Development

### Planned Enhancements

- Advanced user filtering and bulk operations
- Content management for system resources
- Audit logging for admin actions
- Enhanced analytics dashboard
- User activity timeline and engagement metrics
- Role-based access control expansion

### Extension Points

To add new admin features:
1. Add new page under `/app/admin/`
2. Create corresponding API endpoints
3. Add navigation item in the sidebar
4. Implement UI components and data fetching

To extend user management:
1. Add new columns to the user table
2. Extend API endpoints with additional data
3. Update UI components to display/edit new fields

## 11. Deployment Considerations

### Environment Variables

Required for admin functionality:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Initial Setup

1. Run database migrations:
   ```bash
   npx supabase migration up
   ```

2. Setup first admin:
   ```bash
   npm run setup:first-admin your@email.com
   ```

3. Verify admin dashboard access at `/admin`

This documentation provides a comprehensive overview of the admin dashboard system, from user-facing features to technical implementation details, enabling both users and developers to understand and extend the system effectively.