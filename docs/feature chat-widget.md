# Chat Widget Implementation

This document outlines the implementation details for the Marlin chat widget, a custom embeddable widget that integrates with our knowledge base and AI assistant. The widget is designed to be embedded on external websites via a simple script tag.

## Domain Structure

⚠️ **Important Domain Information:**

- **API & Widget Host:** `marlan.photographytoprofits.com` 
  - This is where the widget script, API, and resources are hosted
  - All widget script src references should point to this domain
  - The API endpoint for chat requests is at this domain

- **Primary Embed Target:** `programs.thehighrollersclub.io`
  - This is the main website where the widget will be embedded
  - Other photography websites may also embed the widget
  - These domains must be included in CORS allowed origins

## Overview

The chat widget:
- Leverages our RAG (Retrieval Augmented Generation) implementation for knowledge base access
- Maintains conversation history within the current session (24-hour expiry)
- Provides a streamlined UI matching Marlin's style
- Includes rate limiting (3 requests per minute)
- Can be embedded via a simple script tag or Google Tag Manager
- Is managed through the admin dashboard at `/admin/widget`

## Current Structure and Updates

### Migration to Admin Dashboard

The widget management has been completely migrated to the admin dashboard:

- ✅ Created dedicated admin widget page at `/admin/widget`
- ✅ Implemented enhanced widget configurator with tabbed interface
- ✅ Added navigation link in admin sidebar
- ✅ Configured redirects from old paths
- ✅ Removed standalone demo and test pages

### Current Component Structure

```
/components
  /admin
    /widget
      /widget-configurator.tsx  # Admin-specific widget configurator
  /chat-widget
    /index.tsx                  # Main entry point and container component
    /chat-widget.tsx            # Main UI component for the widget
    /chat-widget-provider.tsx   # Context provider for state management
    /embed-snippet.tsx          # Component for generating embeddable code
    /types.ts                   # TypeScript types for the widget

/app
  /admin
    /widget
      /page.tsx                # Admin widget management page
  /widget.js
    /route.ts                  # Route handler for the widget script
  /api/widget-chat
    /route.ts                  # API endpoint for widget requests

/lib
  /widget
    /session.ts               # Session management utilities
    /rate-limit.ts            # Rate limiting implementation
    /widget-script.js         # Self-contained widget JavaScript
    /gtm-snippet.html         # Google Tag Manager ready HTML snippet
    /gtm-simple.html          # Simplified GTM snippet
    /body-snippet.html        # Direct body embed snippet

/public
  /widget
    /chat-widget.js           # Built and minified widget script - GENERATED
    /chat-widget.js.map       # Source map for debugging - GENERATED
```

### Files Removed in Migration

The following standalone files have been removed as their functionality is now integrated into the admin dashboard:

- ❌ `/app/widget/page.tsx` - Old widget demo page
- ❌ `/app/widget/widget-configurator.tsx` - Old configurator component
- ❌ `/public/widget-test.html` - Standalone test page
- ❌ `/public/widget-embed.html` - Standalone embed example

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

### 5. Widget Script Route Handler (`app/widget.js/route.ts`)

A dedicated route handler that:
- Reads the actual widget script from the filesystem
- Serves the content with proper MIME type headers
- Applies CORS headers for cross-domain access
- Includes error handling for file not found scenarios
- Uses shorter cache time for debugging (3600 seconds)

### 6. Admin Widget Page (`app/admin/widget/page.tsx`)

A comprehensive admin page that:
- Provides a management interface for the chat widget
- Allows customization of widget appearance and behavior
- Generates embed codes for different implementation methods
- Shows a live preview of the widget with current settings
- Includes documentation for implementation and troubleshooting

Key features:
- Tabbed interface for configuration, embed codes, and documentation
- Live preview updates as settings are changed
- Multiple embed code options (standard, GTM, direct)
- Copy-to-clipboard functionality for easy implementation
- Access restricted to admin users

## Embedding Options

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

> **Important Note**: We have two reliable ways to access the widget script:
> 1. Direct reference to the static file: `/widget/chat-widget.js`
> 2. Through the route handler: `/widget.js`
>
> Both methods properly serve the actual JavaScript content. The route handler reads the script file from the filesystem and serves it with appropriate headers, while the rewrite rule in `vercel.json` provides compatibility by redirecting `/widget.js` to the static file.

#### Google Tag Manager Integration

Available through the admin widget interface with copy-to-clipboard functionality.

#### Direct Body Embed

Available through the admin widget interface with copy-to-clipboard functionality.

## Deployment Configuration

### 1. Updated Middleware (`middleware.ts`)

Enhanced middleware that:
- Bypasses authentication for all widget-related paths
- Properly handles static files
- Includes direct checks for HTML and JS files
- Uses improved matcher patterns
- Maintains normal authentication flow for admin widget page

```typescript
// Special bypass for widget-related paths to allow anonymous access
if (
  pathname.startsWith('/api/widget-chat') || 
  pathname.startsWith('/widget') || 
  pathname === '/widget.js' ||
  pathname === '/debug.js' ||
  pathname.includes('.html') ||
  pathname.includes('/chat-widget.js')
) {
  console.log('Bypassing auth middleware for Widget features:', pathname);
  return;
}

// The admin/widget path does not need special handling here as it should
// go through normal authentication via updateSession like other admin paths
```

### 2. Enhanced Vercel Configuration (`vercel.json`)

```json
{
  "headers": [
    // Headers configuration for widget resources
  ],
  "rewrites": [
    { "source": "/widget.js", "destination": "/widget/chat-widget.js" }
  ],
  "redirects": [
    { "source": "/widget", "destination": "/admin/widget", "permanent": true }
  ]
}
```

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

After implementation, verify the following to ensure proper widget functionality:

- [ ] `/admin/widget` page loads correctly for authenticated admin users
- [ ] Widget configuration options work correctly
- [ ] Embed code generation creates valid code snippets
- [ ] `/widget` redirects to `/admin/widget`
- [x] Widget script loads correctly from both `/widget.js` and `/widget/chat-widget.js`
- [ ] Widget can connect to the API at `/api/widget-chat` and receive responses
- [ ] No CORS errors are present in the browser console
- [ ] Rate limiting is functioning correctly (3 requests per minute)

## Usage Instructions

### Accessing the Widget Management Interface

1. Log in to the admin dashboard
2. Navigate to "Widget" in the sidebar
3. Use the interface to configure the widget appearance and behavior
4. Copy the appropriate embed code for your implementation method

### Embedding the Widget

To embed the chat widget on an external website, use one of the code snippets generated in the admin interface:

1. **Standard Script Tag**: Simple JavaScript implementation
2. **Google Tag Manager**: For websites using GTM
3. **Direct Body Embed**: Simplified version for direct embedding

### Troubleshooting

#### Common Issues

1. **Widget not loading**: 
   - Check browser console for errors
   - Verify that the widget script URL is correct
   - Ensure CORS headers are properly configured

2. **API errors**:
   - Verify the `apiEndpoint` is correctly set
   - Check rate limiting settings
   - Examine server logs for detailed error information

3. **404 errors for widget resources**:
   - The `/widget.js` route handler serves the file content directly
   - Both relative and absolute URLs for the script should work correctly

4. **Script loading errors in embedded contexts**:
   - When embedding on external sites, always use absolute URLs for script sources
   - Example: `https://marlan.photographytoprofits.com/widget/chat-widget.js`
   - This prevents path resolution issues when loading from different domains

5. **Admin widget page not accessible**:
   - Verify that the user has admin permissions
   - Check that middleware is properly configured for admin routes
   - Ensure Supabase authentication is working correctly

### Development Notes

When making changes to the widget system:

1. Always run `npm run build:widget` after modifying widget source code
2. Test changes in the admin widget interface before deployment
3. Ensure proper CORS configuration for all routes
4. Update any references to domains if they change
5. After deployment, verify script loading from both `/widget.js` and `/widget/chat-widget.js`
