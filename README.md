# AI Chat Application with Vercel AI SDK, Shadcn UI, and RAG

This application demonstrates how to build a modern AI chat application using the Vercel AI SDK, Shadcn UI components, and Retrieval-Augmented Generation (RAG).

## Features

- 💬 Chat with AI using the Vercel AI SDK
- 🔍 Retrieval-Augmented Generation (RAG) for more accurate responses
- 🌐 Web search and scraping capabilities
- 📊 Deep research using Perplexity API
- 🔐 Authentication with Supabase
- 🎨 Beautiful UI with Shadcn UI components
- 📱 Responsive design for all devices

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- OpenAI API key
- Perplexity API key (optional, for deep search)

## San Diego Project - Next.js with Supabase Auth

## Middleware Configuration Changes for Next.js 15

As of Next.js 15, middleware matcher patterns have stricter requirements. Specifically, capturing groups are no longer allowed in matcher patterns.

### ❌ Deprecated Configuration (Will Break):
```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
```

### ✅ Updated Configuration:
```typescript
export const config = {
  matcher: [
    '/chat/:path*',
    '/settings/:path*',
    '/profile/:path*',
    '/admin/:path*',
    '/login',
    '/api/:path*'
  ]
}
```

## Supabase Authentication Implementation

This project uses the recommended Supabase Server-Side Authentication pattern with Next.js:

1. **Utility Files**:
   - `utils/supabase/middleware.ts`: Contains `updateSession` for token refresh
   - `utils/supabase/server.ts`: Server component client (with React cache)
   - `utils/supabase/client.ts`: Browser client for client components

2. **Authentication Flow**:
   - Root middleware refreshes tokens using `updateSession`
   - Protected routes check authentication with `supabase.auth.getUser()`
   - Authentication headers propagate to API routes

3. **Next.js 15 Requirements**:
   - Async cookie methods: `async getAll()` and `async setAll()`
   - Await the `cookies()` function: `const cookieStore = await cookies()`
   - Await the `headers()` function in API routes

## Important Patterns

### Correct Cookie Handling

```typescript
// In middleware.ts or utils/supabase/middleware.ts
cookies: {
  async getAll() {
    return request.cookies.getAll()
  },
  async setAll(cookiesToSet) {
    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })
  }
}

// In utils/supabase/server.ts
cookies: {
  async getAll() {
    return cookieStore.getAll()
  },
  async setAll(cookiesToSet) {
    try {
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options)
      }
    } catch (error) {
      console.warn('Warning: Could not set cookies in server action or middleware.', error)
    }
  }
}
```

### API Route Authentication

```typescript
export async function GET() {
  const headersList = await headers()
  const userId = headersList.get('x-supabase-auth')
  const isAuthValid = headersList.get('x-auth-valid') === 'true'
  
  if (!userId || !isAuthValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // User is authenticated
}
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

For more detailed information, see the [Supabase Auth Documentation](./docs/supabase-auth.md) and [Middleware Architecture Documentation](./docs/middleware-architecture.md).

## Middleware & Authentication Architecture

### Authentication Flow

The application uses Supabase for authentication with a standardized server-side auth pattern:

1. **Root Middleware (`/middleware.ts`)**: Handles auth token refreshing with `updateSession`, route protection, and setting auth headers for downstream middleware and API routes.

2. **API Middleware (`/app/api/middleware.ts`)**: Focuses on API-specific concerns like CORS, rate limiting, and validating auth headers set by the root middleware.

3. **Standardized Supabase Client**: All Supabase client instances should use the implementation in `utils/supabase/server.ts`.

### Middleware Consolidation Plan

Our middleware architecture is being consolidated to improve performance, reliability, and security:

#### Current Issues:
- Overlapping functionality between middleware layers
- Inconsistent authentication mechanisms
- Race conditions during auth token refreshing
- Redundant database queries

#### Consolidation Strategy:
1. **Standardized Authentication Flow**: Using Supabase SSR pattern with `updateSession` in root middleware
2. **Single Auth Source**: Root middleware sets auth headers that downstream middleware trusts
3. **Specialized Middleware Roles**:
   - Root middleware for auth token refreshing and route protection
   - API middleware for API-specific concerns without redundant auth checks
   - Specialized middleware (admin, rate limiting) focuses on specific tasks

#### Benefits:
- Single authentication source of truth
- Clear responsibility chain
- Reduced API calls and database queries
- Better performance through optimized caching
- Consistent error handling

### Key Authentication Components

- **`utils/supabase/middleware.ts`**: Contains the `updateSession` function for refreshing auth tokens
- **`utils/supabase/server.ts`**: Provides a cached Supabase client for server components
- **`middleware.ts`**: Root middleware that handles auth for the entire application

### Recommended Auth Pattern

For server components and API routes:

```typescript
import { createClient } from '@/utils/supabase/server';

// In async functions
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// Use user data securely
if (user) {
  // User is authenticated
}
```

### Rate Limiting

The application implements tiered rate limiting:

- **Standard API Routes**: 120 requests per minute
- **AI-Related Endpoints**: 40 requests per minute
- **Auth Endpoints**: 15 requests per minute
- **History Endpoint**: 10 requests per minute (with specialized handling)

### Circuit Breaker Pattern

Some API endpoints implement a circuit breaker pattern to prevent cascading failures:

- After 5 consecutive errors, the endpoint enters a "trip" state
- While tripped, requests receive a 503 response with a Retry-After header
- The circuit automatically resets after 60 seconds

## Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env.local
   ```

4. Set up Supabase:
   - Create a new Supabase project
   - Run the SQL from `supabase/migrations/20240306_initial_schema.sql` in the Supabase SQL editor
   - Enable Email/Password authentication in Supabase Auth settings
   - Add your Supabase URL and anon key to `.env.local`

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Setup

1. Copy `.env.example` to `.env.local`
2. Fill in the required environment variables
3. Install dependencies with `npm install`
4. Run the development server with `npm run dev`

### Development Mode Shortcuts

For development only, you can bypass authentication checks by setting:

```
NEXT_PUBLIC_SKIP_AUTH_CHECKS=true
```

This will create a mock user session without requiring actual authentication.

## Deploying to Vercel

### 1. Prepare Your Project

Ensure your project is ready for deployment:
- All environment variables are properly set
- The application builds successfully locally
- You have a Supabase project set up

### 2. Deploy to Vercel

#### Using the Vercel Dashboard

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your repository
5. Configure the project:
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: next build
   - Output Directory: .next
6. Add environment variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   PERPLEXITY_API_KEY=your_perplexity_api_key
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_APP_URL=your_vercel_deployment_url
   ```
7. Click "Deploy"

#### Using Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy the project:
   ```bash
   vercel
   ```

4. Follow the prompts to configure your project.

### 3. Set Up Supabase Authentication Redirect URLs

After deploying to Vercel, you need to update your Supabase authentication settings:

1. Go to your Supabase project dashboard
2. Navigate to Authentication > URL Configuration
3. Add your Vercel deployment URL to the Site URL
4. Add the following redirect URLs:
   - `https://your-vercel-url.vercel.app/auth/callback`
   - `https://your-vercel-url.vercel.app/login`

### 4. Verify Deployment

1. Visit your deployed application
2. Test the authentication flow
3. Test the chat functionality
4. Test the RAG functionality by uploading documents

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `PERPLEXITY_API_KEY` | Your Perplexity API key for deep search | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |
| `NEXT_PUBLIC_APP_URL` | Your application URL | Yes |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No |
| `ENABLE_REMOTE_LOGGING` | Enable remote logging | No |

## Project Structure

- `app/` - Next.js app router pages
- `components/` - UI components
- `lib/` - Core utilities & business logic
  - `agents/` - Agent implementations
  - `chat/` - Chat logic
  - `logger/` - Unified logging system
  - `supabase/` - Supabase client
  - `vector/` - Vector search functionality
- `public/` - Static assets
- `types/` - TypeScript types

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - AI integration
- [Shadcn UI](https://ui.shadcn.com/) - UI components
- [Supabase](https://supabase.com/) - Backend and authentication
- [OpenAI](https://openai.com/) - AI models
- [Perplexity](https://www.perplexity.ai/) - Deep search
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## Known Issues

### Authentication Issues

- **401 Errors with `/api/history` Endpoint**: The application may experience occasional 401 (Unauthorized) errors when accessing the chat history. This is typically due to auth token refresh issues with Supabase. The current implementation includes:
  - Error handling with automatic retry logic
  - Auth failure cooldown to prevent constant retries
  - Background refresh mechanism for the chat history

### Performance Optimizations

- **Vote API Consolidation**: We've eliminated redundant API calls to `/api/vote` by extracting vote data directly from chat messages. This reduces network requests, improves performance, and minimizes 401 errors. See `docs/performance-optimizations.md` for details.

### UI/Accessibility Issues

- **Fixed: Dialog Accessibility Warning**: `Missing Description or aria-describedby for DialogContent` - This has been fixed by adding a `SheetTitle` with an sr-only class to the mobile sidebar's `SheetContent` component.
- **Fixed: Next.js Link Warning**: "onClick was passed to Link with href but legacyBehavior was set" - This has been fixed by moving the onClick handler from the Link component to its child component and removing the legacyBehavior prop.

If you encounter other issues, please submit them through the issue tracker.

## License

MIT 

## Additional Documentation

See the `/docs` folder for more detailed documentation on specific features and components. 