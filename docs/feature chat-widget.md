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

## Widget Management

The widget management interface is fully integrated into the admin dashboard:

- ✅ Dedicated admin widget page at `/admin/widget`
- ✅ Enhanced widget configurator with tabbed interface
- ✅ Navigation link in admin sidebar
- ✅ Dynamic generation of embed codes with proper domain references

### Implementation Details

- The admin widget page is implemented as a client component with standard admin authentication
- Metadata is exported from a server component (layout.tsx)
- Dynamic rendering is enforced with `export const dynamic = "force-dynamic"`
- All authentication is handled by middleware, identical to other admin pages

## Authentication Implementation

The widget admin page uses the standard admin authentication pattern, ensuring consistent behavior across all admin pages:

### Standard Middleware Authentication

All admin pages, including the widget page, use the same middleware-based authentication:

```typescript
// Standard authentication flow for all admin routes
if (pathname.startsWith('/admin')) {
  console.log(`[Middleware] Processing admin page ${pathname} with normal auth flow`);
}

// The session cookie is updated/refreshed in the response
const response = await updateSession(request);

// Consistent logging for all admin pages
if (pathname.startsWith('/admin')) {
  console.log(`[Middleware] Admin page ${pathname} auth processed with status:`, 
    response?.status || 'No response');
}
```

### Clean Admin Page Implementation

The widget page component is now simplified with no redundant authentication checks:

```typescript
'use client';

import React, { useState } from 'react';
import { toast } from '@/components/toast';
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator';
import { ChatWidgetProvider } from '@/components/chat-widget/chat-widget-provider';

// Force dynamic rendering for this admin page
export const dynamic = "force-dynamic";

export default function AdminWidgetPage() {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  
  // No admin verification at component level
  // All authentication is handled by middleware

  return (
    <div className="space-y-6 p-6 border rounded-md">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure and manage your chat widget
        </p>
      </div>

      {/* Widget Configurator */}
      <ChatWidgetProvider>
        <AdminWidgetConfigurator />
      </ChatWidgetProvider>
      
      {/* Other component content */}
    </div>
  );
}
```

This ensures that admin verification for all admin pages happens exclusively at the middleware level, providing consistent behavior across development and production environments.

## Cross-Domain Technical Architecture

The widget implements a cross-domain architecture enabling it to be hosted on `marlan.photographytoprofits.com` while functioning seamlessly when embedded on external domains.

### CORS Implementation

Enhanced CORS handling with support for both specific domains and wildcards:

```typescript
// Function to add CORS headers to a response with improved origin handling
function addCorsHeaders(response: Response, req: NextRequest): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  
  // Enhanced logic: If wildcard is in allowed origins OR the specific origin is allowed
  const isWildcardAllowed = allowedOrigins.includes('*');
  const isSpecificOriginAllowed = origin && allowedOrigins.includes(origin);
  
  const corsHeaders = new Headers(response.headers);
  
  // Set Access-Control-Allow-Origin with proper value based on request
  if (isSpecificOriginAllowed) {
    // When specific origin is allowed, use that exact origin (best practice)
    corsHeaders.set('Access-Control-Allow-Origin', origin);
  } else if (isWildcardAllowed) {
    // When wildcard is allowed and origin isn't specifically allowed, use wildcard
    corsHeaders.set('Access-Control-Allow-Origin', '*');
  }
  
  // Set other CORS headers
  corsHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
  corsHeaders.set('Access-Control-Max-Age', '86400');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders
  });
}
```

### URL Resolution Strategy

Client-side URL resolution with fallbacks:

```typescript
// Client-first URL resolution with fallbacks
const [baseUrl, setBaseUrl] = useState(() => {
  // Client-side rendering - use window.location.origin directly if available
  if (typeof window !== 'undefined') {
    // Browser available - use origin directly
    return window.location.origin;
  }
  
  // Server-side rendering - fall back to getSiteUrl()
  try {
    return getSiteUrl();
  } catch (e) {
    console.error('Error getting site URL:', e);
    // This fallback will be replaced with actual URL after client-side hydration
    return 'https://marlan.photographytoprofits.com';
  }
})
```

## Embedding Options

The admin interface provides several embedding options:

### Standard Script Tag

```html
<script>
(function() {
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlin',
    primaryColor: '#0070f3',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat'
  };
  
  var script = document.createElement('script');
  script.src = 'https://marlan.photographytoprofits.com/widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

### Google Tag Manager Method
Available through the admin widget interface with copy-to-clipboard functionality.

### Direct Body Embed Method
Available through the admin widget interface with copy-to-clipboard functionality.

## Component Structure

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
      /page.tsx                # Admin widget management page (client component)
      /layout.tsx              # Server component for metadata
      /route.config.js         # Dynamic rendering configuration
  /widget.js
    /route.ts                  # Route handler for the widget script
  /api/widget-chat
    /route.ts                  # API endpoint for widget requests

/lib
  /widget
    /env-validator.ts          # Environment validation with fallbacks
    /rate-limit.ts             # Rate limiting implementation
    /widget-script.js          # Self-contained widget JavaScript
    /gtm-snippet.html          # Google Tag Manager ready HTML snippet
    /body-snippet.html         # Direct body embed snippet

/public
  /widget
    /chat-widget.js           # Built and minified widget script
    /chat-widget.js.map       # Source map for debugging
```

## Environment Variables

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

## Production Issues and Solutions

### 1. Client/Server Component Separation

**Problem**: Mixing client components with metadata exports causes hydration errors.

**Solution**: 
- Split into separate components:
  - `layout.tsx`: Server component that exports metadata
  - `page.tsx`: Client component with 'use client' directive
- Both components include `export const dynamic = "force-dynamic"` to ensure proper rendering

### 2. Authentication Implementation

**Problem**: Inconsistent admin page behavior between development and production.

**Solution**:
- Standardize authentication handling across all admin pages
- Remove all component-level admin verification from the widget page
- Rely exclusively on middleware for access control
- Ensure no API calls are made to verify admin status within the component
- Remove all conditional rendering based on admin status checks

### 3. Dynamic Rendering Configuration

**Problem**: Next.js tries to statically render admin pages in production.

**Solution**:
- Add explicit dynamic rendering configuration:
  ```javascript
  // Force dynamic route handling for the admin widget page
  export const dynamic = 'force-dynamic';
  ```
- Implement in both page and layout components

### 4. URL Resolution

**Problem**: Environment variables might not be set correctly in production.

**Solution**:
- Implement client-first URL resolution with multiple fallbacks
- Enhanced validation that accounts for browser environments

## Production Verification Checklist

After deployment, verify the following to ensure proper widget functionality:

- [ ] `/admin/widget` page loads correctly for authenticated admin users
- [ ] Authentication works identically to other admin pages
- [ ] Widget script loads correctly from both `/widget.js` and `/widget/chat-widget.js`
- [ ] Widget can connect to the API at `/api/widget-chat` and receive responses
- [ ] CORS headers are correctly set for cross-domain embedding
- [ ] Environment variables are properly validated with appropriate fallbacks
- [ ] Rate limiting is functioning correctly (3 requests per minute)

## Troubleshooting Guide

### Admin Widget Page Not Loading

1. **Authentication Issues**:
   - Check middleware logs for auth failures
   - Verify the user has admin permissions in the database
   - Check that `/admin/users` and other admin pages also work properly

2. **Rendering Issues**:
   - Verify `export const dynamic = "force-dynamic"` is present
   - Check that route.config.js includes all necessary configuration
   - Look for client/server component conflicts in browser console

### Widget Script Not Loading

1. **CORS Issues**:
   - Check browser console for CORS errors
   - Verify Origin header in Network tab matches allowed origins
   - Ensure OPTIONS requests are handled properly

2. **Path Resolution**:
   - Check for 404 errors in Network tab
   - Verify static files exist in the expected location
   - Ensure middleware is bypassing authentication for widget resources

### API Connection Failures

1. **URL Configuration**:
   - Verify API endpoint URL in embed snippet matches actual deployment
   - Check for hardcoded URLs that might point to development environment
   - Test API endpoint directly to verify it's accessible

2. **Rate Limiting**:
   - Check rate limit headers in API responses
   - Verify Redis connection if using Redis-based rate limiting
   - Check for rate limit error messages in API responses