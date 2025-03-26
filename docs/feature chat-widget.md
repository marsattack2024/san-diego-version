# Chat Widget Implementation Plan

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

## Current Structure and Fixed Issues

### Previous Issues Now Resolved

1. **Route Conflicts:**
   - ✅ Resolved: Removed conflicting `/app/widget-test/page.tsx` that was causing build errors
   - Now using only route handler with proper Content-Type headers

2. **Domain Consistency:**
   - ✅ Fixed: All references to API endpoints and script sources now use `marlan.photographytoprofits.com`
   - Embed snippets now correctly reference this domain for API requests and script loading

3. **CORS Configuration:**
   - ✅ Enhanced: Updated `vercel.json` with explicit headers for all widget resources
   - Added proper Content-Type headers for HTML files
   - Set `Access-Control-Allow-Origin: *` for cross-domain embedding

4. **Static File Access:**
   - ✅ Improved: Updated middleware to better handle static files
   - Added additional bypass patterns for HTML and JS files
   - Enhanced matcher pattern to exclude JS files from auth requirement

5. **Widget Script Loading:**
   - ✅ Fixed: Updated `/widget.js` route handler to serve the actual file content instead of client-side redirect
   - Implemented proper filesystem reading with error handling
   - Set appropriate CORS and caching headers

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
    /route.ts            # Route handler for the test page - VERIFIED ✓
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
    /chat-widget.js     # Built and minified widget script - GENERATED ✓
    /chat-widget.js.map # Source map for debugging - GENERATED ✓
  /widget-test.html     # HTML test page for the widget - VERIFIED ✓
  /widget-embed.html    # Standalone embedding example - VERIFIED ✓
  /debug.js             # Simple debug file to test static file serving - VERIFIED ✓
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

### 5. Widget Script Route Handler (`app/widget.js/route.ts`)

A dedicated route handler that:
- Reads the actual widget script from the filesystem
- Serves the content with proper MIME type headers
- Applies CORS headers for cross-domain access
- Includes error handling for file not found scenarios
- Uses shorter cache time for debugging (3600 seconds)

Implementation:
```typescript
// Serve the widget script file
export async function GET(req: NextRequest) {
  try {
    // Read the actual file content from the filesystem
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public/widget/chat-widget.js');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('Widget.js route: File not found at path:', filePath);
      throw new Error('Widget script file not found');
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    const response = new Response(fileContent, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    
    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    // Error handling...
  }
}
```

### 6. Embedding Options

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

> **Important Note**: We now have two reliable ways to access the widget script:
> 1. Direct reference to the static file: `/widget/chat-widget.js`
> 2. Through the route handler: `/widget.js`
>
> Both methods now properly serve the actual JavaScript content. The route handler reads the script file from the filesystem and serves it with appropriate headers, while the rewrite rule in `vercel.json` provides compatibility by redirecting `/widget.js` to the static file.

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

### 7. Testing Pages

#### Widget Demo Page (`app/widget/page.tsx`)

An interactive demo page that:
- Displays the chat widget
- Provides a configuration interface
- Generates embed code for copying
- Shows real-time previews of configuration changes

#### Widget Test Pages (`public/widget-test.html` and `/app/widget-test/route.ts`)

The static HTML file:
- Embeds the widget with default settings
- Provides a simple test environment
- Includes sample questions for testing

The route handler:
- Serves the HTML file with proper headers
- Sets content type and caching directives
- Provides error handling

## Deployment Configuration

### 1. Updated Middleware (`middleware.ts`)

Enhanced middleware that:
- Bypasses authentication for all widget-related paths
- Properly handles static files
- Includes direct checks for HTML and JS files
- Uses improved matcher patterns

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
```

### 2. Enhanced Vercel Configuration (`vercel.json`)

```json
{
  "headers": [
    {
      "source": "/api/widget-chat",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        // Other CORS headers...
      ]
    },
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
        },
        // Other headers...
      ]
    },
    {
      "source": "/widget/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        // Other headers...
      ]
    },
    {
      "source": "/widget-test.html",
      "headers": [
        {
          "key": "Content-Type",
          "value": "text/html; charset=utf-8"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=3600"
        }
      ]
    },
    {
      "source": "/widget-embed.html",
      "headers": [
        {
          "key": "Content-Type",
          "value": "text/html; charset=utf-8"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=3600"
        }
      ]
    }
  ],
  "rewrites": [
    { "source": "/widget-test", "destination": "/widget-test.html" },
    { "source": "/test", "destination": "/test.html" },
    { "source": "/widget-embed", "destination": "/widget-embed.html" },
    { "source": "/widget.js", "destination": "/widget/chat-widget.js" }
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

After implementing the fixes, verify the following to ensure proper widget functionality:

- [ ] `/widget` page loads correctly and displays the widget demo
- [ ] `/widget-test` is accessible without authentication
- [ ] `/debug.js` loads correctly, confirming static file serving works
- [x] Widget script loads correctly from both `/widget.js` and `/widget/chat-widget.js`
- [ ] Widget can connect to the API at `/api/widget-chat` and receive responses
- [ ] No CORS errors are present in the browser console
- [ ] Rate limiting is functioning correctly (3 requests per minute)
- [x] The widget script is properly cached (check Cache-Control headers)
- [x] Build logs confirm the widget script is built to the correct location
- [ ] Session management works with localStorage persistence
- [ ] The widget is responsive on mobile devices
- [ ] Embedding via GTM successfully loads the widget

## Chat Widget Documentation

### Overview

The chat widget provides a way to embed Marlin's AI chat functionality into external websites. It consists of:

- Frontend JavaScript widget that can be loaded on any website
- Widget-specific API endpoint optimized for external use
- Test pages for verifying functionality

### Implementation Details

#### Widget Script

The widget script is built using the following components:

- **Source**: `lib/widget/widget-script.js`
- **Build Process**: Uses esbuild to compile and minify the widget script
- **Build Command**: `npm run build:widget`
- **Output**: Generates `public/widget/chat-widget.js`

#### API Endpoints

The widget system has several dedicated API endpoints:

1. **Widget Script Loader**: `/widget.js` - Route handler that serves or redirects to the widget script
   - Implementation: `app/widget.js/route.ts`
   - Purpose: Provides CORS-enabled access to the widget script

2. **Widget Chat API**: `/api/widget-chat` - Dedicated chat endpoint for the widget
   - Implementation: `app/api/widget-chat/route.ts`
   - Features: CORS support, rate limiting, specialized response handling

3. **Widget Test Page**: `/widget-test` - HTML page for testing the widget
   - Implementation: `app/widget-test/route.ts`
   - Purpose: Provides a live demo of the widget and embed instructions

#### Deployment Configuration

For proper functionality in production, the following must be configured:

1. **CORS Headers**: Set in both API route handlers and in `vercel.json`
2. **Rewrites**: Defined in `vercel.json` to ensure static files are properly served
3. **Environment Variables**:
   - `WIDGET_ALLOWED_ORIGINS`: Comma-separated list of allowed origins (defaults include `*` for development)
   - `WIDGET_RATE_LIMIT`: Number of requests per window (default: 10)
   - `WIDGET_RATE_LIMIT_WINDOW`: Time window in seconds (default: 60)

### Usage Instructions

#### Embedding the Widget

To embed the chat widget on an external website, add the following code:

```html
<script>
    window.marlinConfig = {
        apiEndpoint: "https://marlan.photographytoprofits.com/api/widget-chat",
        title: "Marlin Assistant",
        description: "Ask me anything about photography",
        welcomeMessage: "Hi! I'm Marlin, your photography assistant. How can I help you today?",
        placeholder: "Ask about photography...",
        primaryColor: "#0d8bf2"
    };
    
    (function() {
        var script = document.createElement('script');
        script.src = "https://marlan.photographytoprofits.com/widget/chat-widget.js";
        script.defer = true;
        script.onload = function() {
            console.log("Marlin Chat Widget loaded successfully");
        };
        script.onerror = function() {
            console.error("Failed to load Marlin Chat Widget");
        };
        document.body.appendChild(script);
    })();
</script>
```

#### Configuration Options

The widget can be customized using the `window.marlinConfig` object:

| Option | Type | Description |
|--------|------|-------------|
| apiEndpoint | string | URL for the widget chat API endpoint |
| title | string | Title displayed in the widget header |
| description | string | Description under the title |
| welcomeMessage | string | Initial message displayed when the widget opens |
| placeholder | string | Placeholder text for the input field |
| primaryColor | string | Main color for widget accents (hex format) |
| position | string | Widget position (default: "bottom-right") |
| debug | boolean | Enable debug mode with console logging |

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
   - ✅ Fixed: The `/widget.js` route handler now properly serves the file content
   - The handler reads the script file from the filesystem and serves it with appropriate headers
   - No more client-side redirects that caused script loading failures
   - Both relative and absolute URLs for the script should now work correctly

4. **Script loading errors in embedded contexts**:
   - When embedding on external sites, always use absolute URLs for script sources
   - Example: `https://marlan.photographytoprofits.com/widget/chat-widget.js`
   - This prevents path resolution issues when loading from different domains

#### Testing

The widget can be tested on the following pages:

1. Demo page: `/widget-test` 
2. Test page with embed code: `/widget-embed`

### Development Notes

When making changes to the widget system:

1. Always run `npm run build:widget` after modifying widget source code
2. Test on the demo page before deployment 
3. Ensure proper CORS configuration for all routes
4. Update any references to domains if they change
5. After deployment, verify script loading from both `/widget.js` and `/widget/chat-widget.js`
