# Chat Widget - Vercel Deployment Guide

This document outlines the implementation details and Vercel deployment configuration for the Marlin chat widget. The widget is designed to be embedded on external websites via a simple script tag and is managed through the admin dashboard.

## Recent Vercel Deployment Updates

We've made several critical updates to ensure the widget works correctly when deployed to Vercel:

1. **Edge Runtime for Widget Route Handler**:
   - Changed `app/widget.js/route.ts` to use Edge Runtime
   - Replaced Node.js filesystem operations with redirect-based approach
   - Added proper error handling for cross-domain embedding

2. **Environment Variables Management**:
   - Created `.env.production` template file with required variables
   - Added fallback URL handling in widget components
   - Implemented browser detection for proper URL resolution

3. **React Component Improvements**:
   - Updated `EmbedSnippet` component with dynamic URL detection
   - Added state-based URL handling in widget configurator
   - Fixed client/server hydration issues with `useEffect`

4. **Vercel Configuration**:
   - Added explicit function configuration in `vercel.json`
   - Configured memory allocation and timeout settings
   - Maintained proper CORS and cache headers

## Required Vercel Environment Variables

The following environment variables must be set in your Vercel project settings:

```
# Critical - Must be set to your Vercel deployment URL
NEXT_PUBLIC_SITE_URL=https://your-vercel-url.vercel.app

# Required for authentication and vector search
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Required for AI features
OPENAI_API_KEY=

# Widget Configuration
WIDGET_ALLOWED_ORIGINS=https://programs.thehighrollersclub.io,https://example.com,*
```

## Deployment Verification Checklist

After deploying to Vercel, verify the following:

- [ ] `/admin/widget` page loads correctly for authenticated admin users
- [ ] Widget configuration options work correctly
- [ ] Embed code generation creates valid code snippets with correct URLs
- [ ] Widget script loads correctly from `/widget.js` (check network tab)
- [ ] No CORS errors appear in browser console
- [ ] URLs in embed snippets correctly use the deployed domain

## Troubleshooting Vercel Deployment

### Common Issues

1. **Missing Admin Widget**: 
   - Verify all environment variables are correctly set in Vercel
   - Check that the build command includes `npm run build:widget`
   - Examine Vercel function logs for errors

2. **Widget Script 404 Errors**:
   - Confirm the Edge function for `/widget.js/route.ts` is deployed
   - Verify the redirect to `/widget/chat-widget.js` is working
   - Check that the build process successfully generated the widget script

3. **URL Resolution Problems**:
   - Ensure `NEXT_PUBLIC_SITE_URL` is set to your exact Vercel domain
   - Check embed snippets for correct domain references
   - Use the fallback URL detection in components as needed

4. **Environment Variable Issues**:
   - Verify the variables are added to the specific deployment environment
   - Check for typos in variable names
   - Use the provided `.env.production` template as a reference

## Implementation Notes

### Widget Route Handler

The widget route handler has been updated to use Edge Runtime:

```typescript
export const runtime = 'edge';

// Serve the widget script file via redirect
export async function GET(req: NextRequest) {
  try {
    // Instead of reading from filesystem, redirect to the static file
    const url = new URL('/widget/chat-widget.js', req.url);
    
    // Create a redirect response
    const response = Response.redirect(url, 307);
    
    // Add CORS headers and return
    return addCorsHeaders(response, req);
  } catch (error) {
    // Error handling...
  }
}
```

### URL Resolution Strategy

Components now use a three-tier URL resolution strategy:

1. Environment variable: `process.env.NEXT_PUBLIC_SITE_URL`
2. Browser detection: `window.location.origin` (client-side only)
3. Fallback: `https://marlan.photographytoprofits.com`

Example implementation:

```typescript
const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_SITE_URL || 'https://marlan.photographytoprofits.com');

// Set base URL with fallback to window.location.origin if running in browser
useEffect(() => {
  if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_SITE_URL) {
    setBaseUrl(window.location.origin);
  }
}, []);
```

## For Additional Documentation

See the full feature documentation in `/docs/feature chat-widget.md` for more details on the widget implementation, RAG functionality, and embedding options. 