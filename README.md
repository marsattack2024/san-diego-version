# Marlan - The Photo Profit Bot

An AI-powered chat application designed specifically for marketing assistance to portrait photographers. Marlan leverages GPT-4o models via the Vercel AI SDK, enhanced with retrieval-augmented generation (RAG), web scraping capabilities, and deep web search functionality through the Perplexity API.

## Features

- 💬 Specialized AI agent types (default, copywriting, Google Ads, Facebook Ads, quiz) for photography marketing
- 🔍 Retrieval-Augmented Generation (RAG) using Supabase with pgvector extension
- 🌐 Automatic URL detection and comprehensive web scraping with content caching
- 📊 Deep web search via Perplexity API (sonar/sonar-pro models) with real-time progress tracking
- 🔐 Secure authentication using Supabase Auth with JWT-based session handling
- 👤 User profile creation with photography business context for personalized AI interactions
- 🎨 Beautiful UI with Shadcn UI components using Radix UI primitives
- 📱 Responsive design for all device sizes with Tailwind CSS
- 📜 Message history saved to database for continuity between sessions
- 🎯 Automatic agent selection based on keyword scoring and content analysis
- 🔗 Website URL scraping and automatic summary generation for comprehensive studio context
- 👨‍💼 Admin portal for user management with profile creation capabilities

## Prerequisites

- Node.js 18+ and npm
- Supabase account with vector extension enabled
- OpenAI API key
- Perplexity API key (optional, for deep search)

## Technical Architecture

### Frontend
- Next.js 15 App Router with TypeScript and ESM module system
- React with shadcn/ui components for UI consistency using Radix UI primitives
- Client-side state management with Zustand stores
- Server-Side Events for real-time DeepSearch progress tracking

### Backend
- Next.js API routes for serverless functionality
- Supabase for authentication, database, and vector search
- Multi-tier rate limiting for API protection (auth, AI, general API)
- Edge middleware for session validation, profile checks, and token refresh
- Efficient caching layers for web content, embeddings, and API responses

### AI Integration
- Vercel AI SDK for model interaction and streaming
- OpenAI models (gpt-4o) with function calling capabilities
- Dynamic tool registration and invocation system
- Perplexity integration (sonar/sonar-pro) for web research with improved context
- Custom agent router with keyword scoring for intelligent routing

### Data Management
- Supabase PostgreSQL database with pgvector extension for semantic search
- Efficient data structures for messages, conversations, profiles, and vector embeddings
- Row-level security policies for data protection
- LRU (Least Recently Used) cache for scraped content and formatted responses
- Real-time logging with structured format for debugging and monitoring

## Key User Flows

### User Onboarding
1. User signs up via email authentication
2. Upon first login, user is redirected to profile setup page
3. User completes profile with business details (full name, company name, description, location)
4. Website URL can be provided for automatic content scraping and summary generation
5. System processes website in background and generates a concise business summary
6. Once profile is complete, user is directed to the chat interface
7. Profile information is automatically included in all future AI interactions

### Chat Interaction
1. User selects agent type (or uses auto-detection)
2. User sends a message query
3. System analyzes query using keyword scoring to determine appropriate specialized agent
4. If URLs are detected, content is automatically scraped and processed
5. If Deep Search is enabled, Perplexity API is called with progress tracking
6. Results from knowledge sources are prioritized (RAG → Web Scraping → Deep Search)
7. AI generates a streaming response with reference to tools used
8. Conversation is saved to history for future context and continuity

### Website Summarization
1. User provides their photography business website URL in profile
2. System automatically scrapes the website content using the comprehensive scraper
3. Content is processed with AI to generate a focused summary of the photography business
4. Summary emphasizes key business aspects: services, style, specialization, and geography
5. Website summary is stored with user profile and included in all future AI interactions
6. Summary provides context without requiring repeated explanations from the user

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
   OPENAI_API_KEY=your_openai_api_key
   PERPLEXITY_API_KEY=your_perplexity_api_key (optional)
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
4. Test the RAG functionality

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
  - `chat/` - Main chat interface
  - `api/` - Backend API endpoints
  - `auth/` - Authentication pages
  - `profile/` - User profile management
  - `admin/` - Admin functionality
- `components/` - UI components
  - `ui/` - UI primitives (shadcn/ui)
  - `chat.tsx` - Main chat component
  - `message.tsx`, `messages.tsx` - Message rendering
  - `multimodal-input.tsx` - Input with file attachment support
- `lib/` - Core utilities and business logic
  - `agents/` - AI agent implementations
  - `chat/` - Chat-related logic
  - `logger/` - Unified logging system
  - `vector/` - Vector search functionality
  - `api/` - API services
  - `middleware/` - Backend middleware
- `stores/` - Zustand state stores
  - `chat-store.ts` - Manages chat state
- `public/` - Static assets
- `types/` - TypeScript types
- `hooks/` - React hooks

## Technologies Used

- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - AI integration for streaming responses
- [Shadcn UI](https://ui.shadcn.com/) - UI components based on Radix UI
- [Supabase](https://supabase.com/) - Backend, authentication and vector search
- [OpenAI](https://openai.com/) - GPT-4o models
- [Perplexity](https://www.perplexity.ai/) - Deep search via sonar/sonar-pro models
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety with ESM module system
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [LRU Cache](https://github.com/isaacs/node-lru-cache) - For content and embedding caching

## Known Issues

### Authentication Issues

- **401 Errors with `/api/history` Endpoint**: The application may experience occasional 401 (Unauthorized) errors when accessing the chat history. This is typically due to auth token refresh issues with Supabase. The current implementation includes:
  - Error handling with automatic retry logic
  - Auth failure cooldown to prevent constant retries
  - Background refresh mechanism for the chat history

### Performance Optimizations

- **Vote API Consolidation**: We've eliminated redundant API calls to `/api/vote` by extracting vote data directly from chat messages. This reduces network requests, improves performance, and minimizes 401 errors.

### UI/Accessibility Issues

- **Fixed: Dialog Accessibility Warning**: `Missing Description or aria-describedby for DialogContent` - This has been fixed by adding a `SheetTitle` with an sr-only class to the mobile sidebar's `SheetContent` component.
- **Fixed: Next.js Link Warning**: "onClick was passed to Link with href but legacyBehavior was set" - This has been fixed by moving the onClick handler from the Link component to its child component and removing the legacyBehavior prop.

If you encounter other issues, please submit them through the issue tracker.

## License

MIT 

## Additional Documentation

See the `/docs` folder for more detailed documentation on specific features and components. 