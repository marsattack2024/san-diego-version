# Chat Widget Implementation Plan

This document outlines the implementation details for the Marlin chat widget, a custom embeddable widget that integrates with our knowledge base and AI assistant. The widget is designed to be embedded on external websites via a simple script tag.

## Overview

The chat widget:
- Leverages our RAG (Retrieval Augmented Generation) implementation for knowledge base access
- Maintains conversation history within the current session (24-hour expiry)
- Provides a streamlined UI matching Marlin's style
- Includes rate limiting (3 requests per minute)
- Can be embedded via a simple script tag or Google Tag Manager

## Current Structure and Known Issues

### Duplicate Routes and Conflicting Files

⚠️ **IMPORTANT:** The codebase currently has several duplicated implementations and conflicting files that need to be addressed:

1. **Route Conflicts:**
   - `/app/widget-test/page.tsx` and `/app/widget-test/route.ts` both try to handle the same path
   - This causes a Next.js build error: "You cannot have two parallel pages that resolve to the same path"

2. **Redundant Implementations:**
   - Two ways to serve the widget script:
     - `/app/widget.js/route.ts` route handler
     - Direct reference to `/public/widget/chat-widget.js` via rewrites
   - Multiple HTML files with similar widget embedding snippets:
     - `/lib/widget/gtm-snippet.html`
     - `/lib/widget/gtm-simple.html`
     - `/lib/widget/body-snippet.html`
     - `/public/widget-test.html`
     - `/public/widget-embed.html`

3. **Inconsistent Domain References:**
   - Some files reference `programs.thehighrollersclub.io`
   - Others reference `marlan.photographytoprofits.com`

### Current Component Structure

```
/components
  /chat-widget
    /index.tsx            # Main entry point and container component
    /chat-widget.tsx      # Main UI component for the widget
    /chat-widget-provider.tsx # Context provider for state management
    /embed-snippet.tsx    # Component for generating embeddable code
    /types.ts             # TypeScript types for the widget

/app
  /widget
    /page.tsx            # Demo page for testing the widget - VERIFIED ✓
    /widget-configurator.tsx # Component for configuring the widget - VERIFIED ✓
  /widget.js
    /route.ts            # Route handler for the widget script - VERIFIED ✓
  /widget-test
    /page.tsx            # Redirect to widget-test.html - CONFLICTS WITH ROUTE HANDLER ⚠️
    /route.ts            # Route handler for the test page - CONFLICTS WITH PAGE COMPONENT ⚠️
  /api/widget-chat
    /route.ts            # API endpoint for widget requests - VERIFIED ✓

/lib
  /widget
    /session.ts         # Session management utilities - VERIFIED ✓
    /rate-limit.ts      # Rate limiting implementation - VERIFIED ✓
    /widget-script.js   # Self-contained widget JavaScript - VERIFIED ✓
    /gtm-snippet.html   # Google Tag Manager ready HTML snippet - VERIFIED ✓
    /gtm-simple.html    # Simplified GTM snippet - VERIFIED ✓
    /body-snippet.html  # Direct body embed snippet - VERIFIED ✓

/public
  /widget
    /chat-widget.js     # Built and minified widget script - GENERATED FROM widget-script.js ✓
    /chat-widget.js.map # Source map for debugging - GENERATED ✓
  /widget-test.html     # HTML test page for the widget - VERIFIED ✓
  /widget-embed.html    # Standalone embedding example - VERIFIED ✓
```

## Implementation Details

### 1. Session Management (`lib/widget/session.ts`)

The widget uses browser localStorage for session persistence with the following features:
- Unique session ID generation with `crypto.randomUUID()`
- Session expiry after 24 hours of inactivity
- Functions for creating, retrieving, updating, and clearing sessions
- Message history tracking within the session

Key functions:
- `generateSessionId()`: Creates a unique UUID for session identification
- `getSession()`: Retrieves the current session or creates a new one
- `addMessageToSession()`: Adds a message to the session and updates the last active timestamp
- `clearSession()`: Removes the session from localStorage

### 2. Rate Limiting (`lib/widget/rate-limit.ts`)

A dual-layer rate limiting system that:
- Uses Redis as the primary store with in-memory fallback
- Limits to 3 requests per minute per session
- Falls back to IP-based limiting when session ID is not available
- Provides detailed rate limit information in response headers

Implementation:
- Redis-based limiting with TTL for distributed environments
- Memory-based fallback for development or when Redis is unavailable
- Proper error handling to allow requests if rate limiting fails

### 3. Widget Script (`lib/widget/widget-script.js`)

A self-contained JavaScript file that:
- Creates and injects all necessary DOM elements
- Manages widget state (open/closed)
- Handles user interactions
- Communicates with the API
- Processes streaming responses

Key features:
- Self-contained with no external dependencies
- Customizable appearance (colors, position, size)
- Responsive design with mobile support
- Message formatting with Markdown-like styling
- Real-time response streaming
- Error handling and retry logic

### 4. API Route (`app/api/widget-chat/route.ts`)

A dedicated API route that:
- Processes widget chat requests
- Applies rate limiting
- Searches the knowledge base with RAG
- Streams AI responses back to the widget

Key features:
- Edge runtime for improved performance
- CORS support for cross-domain embedding
- Robust error handling
- Session tracking
- Rate limiting middleware integration
- RAG (Retrieval Augmented Generation) for knowledge base access
- AI response streaming

### 5. Embedding Options

#### Standard Script Tag

```html
<script>
(function() {
  // Configure the widget
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlin',
    primaryColor: '#0070f3',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat'
  };
  
  // Load the widget script
  var script = document.createElement('script');
  script.src = 'https://marlan.photographytoprofits.com/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

> **Important Note**: We previously used `/widget.js` as the script source, which relied on a route handler to serve the file. However, due to inconsistencies in how route handlers process static files in production, we now directly reference the built widget script at `/widget/chat-widget.js`. This approach is more reliable as it bypasses any potential issues with route handlers and connects directly to the file where it's actually built and deployed.
>
> However, for backward compatibility, we maintain the `/widget.js` route handler and use a rewrite rule in `vercel.json` that redirects `/widget.js` to `/widget/chat-widget.js`.

#### Google Tag Manager Integration (`lib/widget/gtm-snippet.html`)

A GTM-ready snippet that:
- Checks if the widget is already loaded
- Configures the widget with default or custom settings
- Loads the widget script asynchronously
- Includes error handling
- Pushes events to the dataLayer for analytics tracking

#### Simplified GTM Version (`lib/widget/gtm-simple.html`)

A minimal GTM snippet that:
- Has fewer lines for easier GTM implementation
- Contains only essential configuration
- Omits analytics tracking for simpler integration

#### Direct Body Embed (`lib/widget/body-snippet.html`)

A basic embed to be placed directly before the closing `</body>` tag:
- Minimal code for direct HTML embedding
- Configures and loads the widget with default settings

#### Standalone Example Page (`public/widget-embed.html`)

A complete HTML page that:
- Demonstrates the widget in action
- Provides copyable embed code with instructions
- Serves as a self-contained example

### 6. Testing Pages

#### Widget Demo Page (`app/widget/page.tsx`)

An interactive demo page that:
- Displays the chat widget
- Provides a configuration interface
- Generates embed code for copying
- Shows real-time previews of configuration changes

#### Widget Test Pages

Two implementations that currently conflict:

1. **Static HTML File** (`public/widget-test.html`):
   - Embeds the widget with default settings
   - Provides a simple test environment
   - Includes sample questions for testing

2. **Next.js Page + Route Handler**:
   - `app/widget-test/page.tsx`: Redirects to the HTML file
   - `app/widget-test/route.ts`: Serves the HTML file with proper headers
   - These two files conflict and cause build errors

## Route Implementation

### 1. Widget Script Route (`app/widget.js/route.ts`)

A dedicated route handler that:
- Serves the minified widget script from the build output
- Sets proper Content-Type and caching headers
- Handles CORS for cross-domain embedding
- Provides error handling with fallback content

```typescript
// Serve the widget script file
export async function GET(req: NextRequest) {
  try {
    // Point directly to where the file is actually being built
    const filePath = join(process.cwd(), 'public/widget/chat-widget.js')
    const scriptContent = readFileSync(filePath, 'utf-8')
    
    // Create response with proper content type and caching headers
    const response = new Response(scriptContent, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
    
    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    console.error('Error serving widget script:', error)
    const errorResponse = new Response('console.error("Failed to load chat widget script");', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    })
    return addCorsHeaders(errorResponse, req);
  }
}
```

### 2. Test Page Route Conflict (`app/widget-test/route.ts` vs `app/widget-test/page.tsx`)

These files create a conflict because they try to handle the same route:

```typescript
// app/widget-test/page.tsx - Causes conflict with route.ts
import { redirect } from 'next/navigation';

export default function WidgetTestPage() {
  redirect('/widget-test.html');
}
```

```typescript
// app/widget-test/route.ts - Causes conflict with page.tsx
export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public/widget-test.html');
    const htmlContent = readFileSync(filePath, 'utf8');
    
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      }
    });
  } catch (error) {
    console.error('Error serving widget-test.html:', error);
    return new NextResponse('Error loading widget test page', { 
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
```

## Middleware Configuration

The app's middleware (`middleware.ts`) has been configured to:
- Bypass authentication for all widget-related paths
- Allow anonymous access to the widget API and resources
- Use pattern matching for flexible path handling

```typescript
// Special bypass for widget-related paths to allow anonymous access
if (
  pathname.startsWith('/api/widget-chat') || 
  pathname.startsWith('/widget') || 
  pathname === '/widget.js' || 
  pathname.includes('widget-test.html') ||
  pathname.includes('test.html')
) {
  console.log('Bypassing auth middleware for Widget features:', pathname);
  return;
}
```

## Build and Deployment

### Build Process

1. The widget script is built using esbuild:
```
esbuild lib/widget/widget-script.js --bundle --minify --outfile=public/widget/chat-widget.js --sourcemap
```

2. This is configured in `package.json`:
```json
"scripts": {
  "build:widget": "esbuild lib/widget/widget-script.js --bundle --minify --outfile=public/widget/chat-widget.js --sourcemap",
  "postbuild": "npm run build:widget && echo 'Widget built to: public/widget/chat-widget.js'"
}
```

3. The postbuild script ensures the widget is built after Next.js build completes

### Deployment Configuration

Vercel configuration (`vercel.json`) includes:

1. CORS and caching headers for widget routes:
```json
{
  "source": "/widget.js",
  "headers": [
    {
      "key": "Content-Type",
      "value": "application/javascript; charset=utf-8"
    },
    {
      "key": "Cache-Control",
      "value": "public, max-age=31536000, immutable"
    },
    {
      "key": "Access-Control-Allow-Origin",
      "value": "*"
    }
  ]
}
```

2. Path rewrites for static HTML files:
```json
"rewrites": [
  { "source": "/widget-test", "destination": "/widget-test.html" },
  { "source": "/test", "destination": "/test.html" },
  { "source": "/widget-embed", "destination": "/widget-embed.html" },
  { "source": "/widget.js", "destination": "/widget/chat-widget.js" }
]
```

## Troubleshooting Common Widget Issues

### 1. Resolving Route Conflicts

**Problem**: We currently have a build error because `app/widget-test/page.tsx` and `app/widget-test/route.ts` both try to handle the same path:
```
Failed to compile.
app/widget-test/page.tsx
You cannot have two parallel pages that resolve to the same path. Please check /widget-test/page and /widget-test/route.
```

**Solution Options**:
1. **RECOMMENDED**: Remove `app/widget-test/page.tsx` since the rewrite in `vercel.json` already handles redirecting `/widget-test` to `/widget-test.html`
2. Alternative: Use a route group to separate the handlers, for example:
   - `app/(widget)/widget-test/page.tsx`
   - `app/api/widget-test/route.ts`

### 2. 404 Errors and Access Issues

**Problem**: Widget pages (`/widget`, `/widget-test.html`) may not be accessible, and the widget script may not load correctly, resulting in 404 errors.

**Root Causes**:
- Middleware authentication path matching was too restrictive (using exact matches)
- Next.js wasn't properly serving HTML files from the public directory when middleware was in place
- Path misalignment between built files and routes
- Vercel deployment treating static HTML files differently than expected

**Solutions Implemented**:

1. **Updated middleware path handling** to use pattern matching instead of exact matching
2. **Added explicit rewrites in vercel.json** to ensure HTML files are properly served
3. **Enhanced MIME type handling** in the widget.js route to prevent browser MIME type errors
4. **Improved build verification** with the postbuild script
5. **Created dedicated route handlers** for widget.js and widget-test

### 3. Domain and Path Consistency Issues

**Problem**: Different files reference different domains and paths:
- Some use `programs.thehighrollersclub.io`
- Others use `marlan.photographytoprofits.com`

**Solution**: Standardize on a single domain in all embeddable files:
1. Update all embed snippets to use the same domain
2. Use environment variables where possible to make domain configurable
3. Document the correct domain to use in production

## Recommended Cleanup Actions

To resolve the current duplications and conflicts:

1. **Delete or refactor `app/widget-test/page.tsx`** to resolve the route conflict
2. **Standardize on a single domain** for all embed snippets
3. **Consolidate embedding options** to reduce duplication:
   - Keep `gtm-snippet.html` for full GTM implementation
   - Keep `body-snippet.html` for direct embedding
   - Consider removing redundant files
4. **Update documentation** to clearly explain the relationship between files
5. **Add comments to critical files** explaining their purpose and relationship to other files

## Environment Variables

### Required Variables

```
# Widget-specific environment variables
WIDGET_ALLOWED_ORIGINS=https://programs.thehighrollersclub.io,https://example.com,*
WIDGET_RATE_LIMIT=3
WIDGET_RATE_LIMIT_WINDOW=60000

# Required for RAG functionality
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
OPENAI_API_KEY=your-openai-api-key

# Optional Redis configuration for rate limiting
REDIS_URL=your-redis-url
REDIS_TOKEN=your-redis-token
```

## Production Verification Checklist

After implementing the fixes, verify the following to ensure proper widget functionality:

- [ ] `/widget` page loads correctly and displays the widget demo
- [ ] `/widget-test` is accessible without authentication
- [ ] Widget script loads correctly from both `/widget.js` and `/widget/chat-widget.js`
- [ ] Widget can connect to the API at `/api/widget-chat` and receive responses
- [ ] No CORS errors are present in the browser console
- [ ] Rate limiting is functioning correctly (3 requests per minute)
- [ ] The widget script is properly cached (check Cache-Control headers)
- [ ] Build logs confirm the widget script is built to the correct location
- [ ] Session management works with localStorage persistence
- [ ] The widget is responsive on mobile devices
- [ ] Embedding via GTM successfully loads the widget
