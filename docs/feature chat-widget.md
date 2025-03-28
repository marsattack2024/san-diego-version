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
- Can be embedded via a simple script tag, Google Tag Manager, or direct body embed
- Is managed through the admin dashboard at `/admin/widget`
- Provides consistent behavior between the admin preview and remote website embeds
- Implements pre-warming to minimize cold start delays

## Widget Management

The widget management interface is fully integrated into the admin dashboard:

- Dedicated admin widget page at `/admin/widget`
- Enhanced widget configurator with settings and embed code tabs
- Navigation link in admin sidebar
- Dynamic generation of embed codes with proper domain references
- Live preview always visible in the configured position
- Simple copy-to-clipboard functionality for all embed types

### Implementation Details

- The admin widget page is implemented as a client component with standard admin authentication
- Metadata is exported from a server component (layout.tsx)
- Dynamic rendering is enforced with `export const dynamic = "force-dynamic"`
- All authentication is handled by middleware, identical to other admin pages
- Live preview updates in real-time as settings are changed
- The widget JavaScript implementation matches the behavior of the React component for consistency
- Automatic API pre-warming sends a lightweight ping request to wake up the serverless infrastructure when the widget loads (not when clicked), ensuring faster response times for the first user message

## Component Structure

```
/components
  /admin
    /widget
      /widget-configurator.tsx  # Admin-specific widget configurator
  /chat-widget
    /chat-widget.tsx           # Main UI component for the widget
    /chat-widget-provider.tsx  # Context provider for state management
    /types.ts                 # TypeScript types for the widget

/app
  /admin
    /widget
      /page.tsx               # Admin widget management page (client component)
      /layout.tsx             # Server component for metadata
      /route.config.js        # Dynamic rendering configuration
  /api/ping
    /route.ts                # Lightweight endpoint for pre-warming serverless functions
  /widget.js
    /route.ts                # Route handler for the widget script
  /api/widget-chat
    /route.ts                # API endpoint for widget requests

/lib
  /widget
    /widget-script.js        # Self-contained widget JavaScript
    /gtm-snippet.html        # Google Tag Manager ready HTML snippet
    /body-snippet.html       # Direct body embed snippet

/public
  /widget
    /chat-widget.js         # Built and minified widget script
    /chat-widget.js.map     # Source map for debugging
```

## Embedding Options

The admin interface provides three embedding options:

### Standard Script Tag

```html
<script>
(function() {
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlan',
    primaryColor: '#0070f3',
    greeting: "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?",
    placeholder: 'Type your message...',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat',
    width: '350px',
    height: '500px',
    zIndex: 9999
  };
  
  var script = document.createElement('script');
  script.src = 'https://marlan.photographytoprofits.com/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

### Google Tag Manager Method
```html
<script>
(function() {
  if (window.marlinChatLoaded) return;
  window.marlinChatLoaded = true;
  
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlan',
    primaryColor: '#0070f3',
    greeting: "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?",
    placeholder: 'Type your message...',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat',
    width: '350px',
    height: '500px',
    zIndex: 9999
  };
  
  var script = document.createElement('script');
  script.src = "https://marlan.photographytoprofits.com/widget/chat-widget.js";
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    console.error("Failed to load Marlan Chat Widget");
    if (window.dataLayer) {
      window.dataLayer.push({
        'event': 'marlinChatWidgetError',
        'marlinChat': {
          'error': true,
          'timestamp': new Date().toISOString()
        }
      });
    }
  };
  document.head.appendChild(script);
  
  if (window.dataLayer) {
    window.dataLayer.push({
      'event': 'marlinChatWidgetLoaded',
      'marlinChat': {
        'loaded': true,
        'timestamp': new Date().toISOString()
      }
    });
  }
})();
</script>
```

### Direct Body Embed Method
```html
<div id="marlin-chat-container"></div>
<script>
(function() {
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlan',
    primaryColor: '#0070f3',
    greeting: "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?",
    placeholder: 'Type your message...',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat',
    width: '350px',
    height: '500px',
    zIndex: 9999,
    container: 'marlin-chat-container'
  };
  
  var script = document.createElement('script');
  script.src = 'https://marlan.photographytoprofits.com/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

## Widget Configuration Options

The widget configurator provides the following customization options:

### Basic Settings
- `title`: The title displayed in the widget header
- `greeting`: The initial message shown to users before any interaction begins
- `placeholder`: Placeholder text for the message input field
- `width`: Width of the widget (default: '350px')
- `height`: Height of the widget (default: '500px')
- `zIndex`: Z-index for the widget (default: 9999)

### Appearance Settings
- `position`: Choose from 'bottom-right', 'bottom-left', 'top-right', or 'top-left'
- `primaryColor`: Custom color picker for widget accent color
- `bubbleIcon`: Optional URL to a custom icon for the chat bubble

## Important Technical Notes

- **Greeting Display**: The greeting configured in `window.marlinChatConfig` is displayed as a welcome message when the widget first loads. It's displayed exactly as configured, without any default fallbacks.
- **Script Path**: Always use the correct path to the widget script: `https://marlan.photographytoprofits.com/widget/chat-widget.js`
- **API Interaction**: The widget connects to the API endpoint specified in the configuration to send and receive messages. The API handles the actual conversation with the AI model.
- **Initialization**: The widget uses the same initialization approach as the admin panel preview to ensure consistent behavior.
- **CORS Configuration**: The server includes proper CORS headers to allow embedding on approved external domains.
- **Cold Start Prevention**: When the widget loads (not when clicked), it automatically sends a lightweight ping request to pre-warm the serverless infrastructure. This minimizes delays when the user sends their first message, preventing timeouts and login errors that can occur with cold serverless functions.

## Production Verification Checklist

When deploying or updating the widget, verify the following:

- `/admin/widget` page loads correctly for authenticated admin users
- Authentication works identically to other admin pages
- Widget script loads correctly from `/widget/chat-widget.js`
- Widget can connect to the API at `/api/widget-chat` and receive responses
- CORS headers are correctly set for cross-domain embedding
- Rate limiting is functioning correctly (3 requests per minute)
- Live preview updates correctly as settings are changed
- All three embed code options generate valid code
- Copy buttons work correctly for all embed code options
- Custom greeting message displays correctly in both admin preview and remote embeds
- Placeholder text customization works properly
- Widget behavior is consistent between admin preview and remote website embeds
- Pre-warming functionality sends ping request to `/api/ping` when widget loads
- First user message receives prompt response without timeout errors