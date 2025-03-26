# Chat Widget Implementation Plan

This document outlines the implementation details for the Marlin chat widget, a custom embeddable widget that integrates with our knowledge base and AI assistant. The widget is designed to be embedded on external websites via a simple script tag.

## Overview

The chat widget:
- Leverages our RAG (Retrieval Augmented Generation) implementation for knowledge base access
- Maintains conversation history within the current session (24-hour expiry)
- Provides a streamlined UI matching Marlin's style
- Includes rate limiting (3 requests per minute)
- Can be embedded via a simple script tag or Google Tag Manager

## Architecture

### Component Structure

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
    /page.tsx            # Demo page for testing the widget
    /widget-configurator.tsx # Component for configuring the widget
  /widget.js
    /route.ts            # API route for serving the widget script
  /widget-test
    /route.ts            # Route handler for the widget test page

/lib
  /widget
    /session.ts         # Session management utilities
    /rate-limit.ts      # Rate limiting implementation
    /widget-script.js   # Self-contained widget JavaScript
    /gtm-snippet.html   # Google Tag Manager ready HTML snippet
    /gtm-simple.html    # Simplified GTM snippet

/public
  /widget
    /chat-widget.js     # Built and minified widget script
    /chat-widget.js.map # Source map for debugging
  /widget-test.html     # HTML test page for the widget
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
    apiEndpoint: 'https://programs.thehighrollersclub.io/api/widget-chat'
  };
  
  // Load the widget script
  var script = document.createElement('script');
  script.src = 'https://programs.thehighrollersclub.io/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

> **Important Note**: We previously used `/widget.js` as the script source, which relied on a route handler to serve the file. However, due to inconsistencies in how route handlers process static files in production, we now directly reference the built widget script at `/widget/chat-widget.js`. This approach is more reliable as it bypasses any potential issues with route handlers and connects directly to the file where it's actually built and deployed.

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

### 6. Testing Pages

#### Widget Demo Page (`app/widget/page.tsx`)

An interactive demo page that:
- Displays the chat widget
- Provides a configuration interface
- Generates embed code for copying
- Shows real-time previews of configuration changes

#### Widget Test Page (`public/widget-test.html`)

A standalone test page that:
- Embeds the widget with default settings
- Provides a simple test environment
- Includes sample questions for testing

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

### 2. Test Page Route (`app/widget-test/route.ts`)

A route handler for serving the widget test page:
- Reads the HTML file from the public directory
- Sets proper Content-Type headers
- Provides error handling and fallback content

```typescript
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
  { "source": "/test", "destination": "/test.html" }
]
```

## Troubleshooting Common Widget Issues

During implementation and deployment, we encountered several issues that required specific fixes. This section documents these challenges and their solutions for future reference.

### 1. 404 Errors and Access Issues

**Problem**: Widget pages (`/widget`, `/widget-test.html`) were not accessible, and the widget script was not loading correctly, resulting in 404 errors.

**Root Causes**:
- Middleware authentication path matching was too restrictive (using exact matches)
- Next.js wasn't properly serving HTML files from the public directory when middleware was in place
- Path misalignment between built files and routes
- Vercel deployment treating static HTML files differently than expected

**Solutions Implemented**:

1. **Updated middleware path handling** to use pattern matching instead of exact matching:
```typescript
// Before
if (
  pathname === '/api/widget-chat' || 
  pathname === '/widget' || 
  pathname === '/widget.js' || 
  pathname === '/widget-test.html'
) { ... }

// After
if (
  pathname.startsWith('/api/widget-chat') || 
  pathname.startsWith('/widget') || 
  pathname === '/widget.js' || 
  pathname.includes('widget-test.html') ||
  pathname.includes('test.html')
) { ... }
```

2. **Added explicit rewrites in vercel.json** to ensure HTML files are properly served:
```json
"rewrites": [
  { "source": "/widget-test", "destination": "/widget-test.html" },
  { "source": "/test", "destination": "/test.html" }
]
```

3. **Enhanced MIME type handling** in the widget.js route to prevent browser MIME type errors:
```typescript
const response = new Response(scriptContent, {
  headers: {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  },
});
```

4. **Improved build verification** by updating the package.json postbuild script:
```json
"postbuild": "npm run build:widget && echo 'Widget built to: public/widget/chat-widget.js'",
```

5. **Created dedicated route handlers** for both widget.js and widget-test:
```typescript
// app/widget.js/route.ts
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

// app/widget-test/route.ts
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

### 2. CORS and Content Type Issues

**Problem**: Even when the widget script was found, browsers sometimes rejected it due to CORS or content type issues.

**Solution**: Enhanced the route handler for `/widget.js` with proper headers:
- Set explicit Content-Type headers
- Added CORS headers for cross-origin requests
- Implemented proper cache control with immutable directive
- Added `nosniff` directive to prevent content type sniffing
- Created a dedicated route handler to serve the file with correct headers

### 3. Middleware Patterns

**Problem**: The middleware matcher patterns were not correctly bypassing authentication for widget-related routes.

**Solution**: Updated the matcher pattern in middleware.ts to properly exclude widget paths:
```javascript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/|public/|api/public|widget-test\\.html|test\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Explicitly include API routes that need auth
    '/api/chat/:path*',
    '/api/history/:path*',
  ],
}
```

### 4. Static Files vs Route Handlers

**Problem**: Next.js and Vercel's handling of static files in the public directory can be inconsistent, especially with middleware involved.

**Solution**: Moved from relying on static file serving to explicit route handlers:
- Created dedicated route handlers for `/widget.js` and `/widget-test`
- These route handlers read the files from disk and serve them with proper headers
- This approach provides more control over content types, caching, and CORS
- Route handlers are more reliable than static file serving when middleware is involved

These solutions ensure that:
1. The widget script is properly served with correct headers
2. Static HTML test pages are accessible without authentication
3. The middleware correctly bypasses authentication for widget-related paths
4. All paths are correctly aligned between the build output and the routes
5. Route handlers provide consistent, reliable access to widget assets

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

After implementing the fixes above, verify the following to ensure proper widget functionality:

- [ ] `/widget` page loads correctly and displays the widget demo
- [ ] `/widget-test` is accessible without authentication
- [ ] Widget script loads correctly from `/widget.js` with proper MIME type
- [ ] Widget can connect to the API at `/api/widget-chat` and receive responses
- [ ] No CORS errors are present in the browser console
- [ ] Rate limiting is functioning correctly (3 requests per minute)
- [ ] The widget script is properly cached (check Cache-Control headers)
- [ ] Build logs confirm the widget script is built to the correct location
- [ ] Session management works with localStorage persistence
- [ ] The widget is responsive on mobile devices
- [ ] Embedding via GTM successfully loads the widget
