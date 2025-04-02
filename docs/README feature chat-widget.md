# Chat Widget

A lightweight, embeddable chat widget that can be added to any website. This widget leverages the Vercel AI SDK for streaming AI responses with a clean, responsive UI.

## Features

- Real-time message streaming via Vercel AI SDK
- Client-side session persistence across page reloads
- Responsive design for all devices
- Rate limiting support with user feedback
- Customizable appearance and behavior
- Comprehensive error handling with visual feedback
- Accessibility support
- Automatic RAG (Retrieval Augmented Generation) for relevant answers
- Optimized UI with smooth scrolling and clean visual feedback

## Data Storage & Persistence

The widget uses a client-side only persistence strategy:

1. **Local Storage**: All chat messages and session information are stored in the browser's localStorage.
2. **No Server-Side Persistence**: Unlike the main chat application, the widget does not store messages in the database.
3. **Session Management**: Session IDs are generated client-side and maintained across page reloads.
4. **No Title Generation**: The widget does not generate or store chat titles since they aren't needed for the widget experience.

This approach has several benefits:
- Better privacy as user data stays in their browser
- Reduced database load on the server
- Simplified data management for embedded contexts
- Works even when users aren't authenticated

## Implementation Details

The widget is implemented using a modern approach with the Vercel AI SDK:

1. **`useAppChat` hook** - A wrapper around Vercel AI SDK's `useChat` that adds:
   - Session management with local storage
   - Rate limit handling and detection
   - Custom error messages with retry capability
   - Client-side message history persistence
   - API configuration for different environments
   - Automatic recovery from cold starts
   - Network error detection and handling

2. **`ChatWidgetV2` component** - The UI component that:
   - Provides a floating chat button
   - Expands to a full chat interface
   - Handles responsive layout and accessibility
   - Displays streaming messages in real-time
   - Supports rich message formatting
   - Includes loading and error states with visual indicators
   - Provides retry buttons for failed messages
   - Auto-scrolls to show new content as it appears

## Error Handling & Recovery

The widget implements comprehensive error handling:

1. **Network Issues**: Automatically detects connectivity problems and provides appropriate messaging
2. **Cold Starts**: Implements automatic retry for the first message when cold starts occur
3. **Visual Feedback**: Shows clear error states with retry options
4. **Rate Limiting**: Displays user-friendly messages when rate limits are reached
5. **Graceful Degradation**: Continues functioning even when some features are unavailable

## API Communication

The widget communicates with the `/api/widget-chat` endpoint, which:

- Uses the same chat engine as the main application but with widget-specific configuration
- Handles anonymous sessions without requiring authentication
- Disables server-side message persistence
- Returns standardized error responses in a format the widget can display
- Provides proper CORS support for cross-domain embedding
- Uses a lower token limit for faster responses in embedded contexts

## Technical Architecture

The widget is built with a modular architecture:

- `ChatWidgetV2`: Main component providing the UI with error state handling
- `useAppChat`: Custom hook integrating with Vercel AI SDK and handling client-side persistence
- `types.ts`: TypeScript interfaces for widget configuration
- `chat-widget-v2.js`: Standalone script for embedding
- `/api/widget-chat/route.ts`: API endpoint handling requests using the unified ChatEngine (with widget-specific config)
- `/app/widget.js/route.ts`: Route handler serving the widget script

## Troubleshooting Common Issues

### CORS Problems

If the widget fails with CORS errors:
- Ensure the domain is listed in `WIDGET_ALLOWED_ORIGINS` environment variable
- Check that your endpoint is returning proper CORS headers
- For development, use a localhost URL that matches the allowed origins

### Cold Start Issues

The widget implements several techniques to handle cold starts:
- Automatic retry mechanism for the first message
- API warming on initial page load
- Visual feedback during retries
- Proper error recovery with exponential backoff

### Network Connectivity

When network issues occur:
- The widget shows a clear error message
- A retry button is provided to resend failed messages
- The error state is automatically cleared when typing a new message
- Network recovery is handled gracefully

## Deployment Status

The widget is currently live and functional on:

- [The High Rollers Club](https://programs.thehighrollersclub.io/)
- [Marlan - Photography Profits](https://marlan.photographytoprofits.com/)

## Usage

### Basic Implementation

```tsx
import { ChatWidgetV2 } from '@/components/chat-widget';

export default function Page() {
  return (
    <div>
      <h1>My Website</h1>
      {/* Other content */}
      
      <ChatWidgetV2 />
    </div>
  );
}
```

### Customization

You can customize the widget appearance and behavior:

```tsx
<ChatWidgetV2 
  config={{
    position: 'bottom-right',
    title: 'Chat with Marlan',
    primaryColor: '#0070f3',
    greeting: 'Hello! How can I help with your photography needs today?',
    placeholder: 'Ask me anything about photography...',
    width: 360,
    height: 500,
  }}
/>
```

## Admin Configuration Interface

The widget includes an admin configuration interface:

- Located at `/admin/widget`
- Provides real-time previewing of widget appearance
- Generates embed code for external websites
- Supports multiple embedding methods (standard, GTM, direct)
- Allows customization of text content and appearance

## Embedding on External Websites

To embed the widget on external websites, use one of these methods:

### Standard Embed

```html
<script>
(function() {
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlan',
    primaryColor: '#0070f3',
    greeting: 'I\'m your Mastermind AI companion!',
    placeholder: 'Type your message...',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat'
  };
  
  var script = document.createElement('script');
  script.src = 'https://marlan.photographytoprofits.com/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

### Google Tag Manager Integration

For sites using Google Tag Manager, a specialized version is available through the admin interface that includes:
- Error tracking with dataLayer events
- Loading status notifications
- Auto-detection of duplicate widget loading

### Direct Body Embed

For sites that need the widget in a specific location:

```html
<div id="marlin-chat-container"></div>
<script>
(function() {
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlan',
    primaryColor: '#0070f3',
    greeting: 'I\'m your Mastermind AI companion!',
    placeholder: 'Type your message...',
    apiEndpoint: 'https://marlan.photographytoprofits.com/api/widget-chat',
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

## API Endpoint

The widget communicates with the `/api/widget-chat` endpoint, which:

- Handles anonymous user sessions
- Processes messages using the unified chat engine
- Returns streaming responses with progress indications
- Manages rate limiting with informative feedback
- Provides CORS support for cross-domain embedding
- Implements Vercel AI SDK's tool system for RAG capabilities

## Vercel AI SDK Integration

The widget uses Vercel AI SDK to provide:

- Streaming message chunks in real-time
- Tool-based RAG for accurate knowledge retrieval
- Consistent UI states (ready, streaming, error)
- Efficient message submission and processing
- Enhanced error handling with retry capability

## Backwards Compatibility

To ensure existing implementations continue to work:
- `chat-widget.js` is maintained as a symbolic link to `chat-widget-v2.js`
- The API endpoint maintains compatibility with previous request formats
- Embed snippets generated from the previous version continue to function

### Upgraded Components
The widget has been fully refactored to use the Vercel AI SDK:
- Original `chat-widget.tsx` replaced with `chat-widget-v2.tsx`
- Widget JS script refactored to use modern patterns
- Enhanced with continuous scroll monitoring and empty message filtering

## Performance Considerations

- The widget is designed to be lightweight (~20KB gzipped)
- It uses lazy loading to minimize impact on page load times
- All styles are isolated with unique class names to prevent conflicts
- The widget respects user preferences (dark mode, reduced motion, etc.)
- Implements efficient token usage in API calls
- Uses LRU caching for frequently accessed knowledge

## Edge Runtime and Wakeup System

The widget API is implemented using Next.js Edge Runtime for global low-latency deployment and faster startup times. To mitigate cold starts when the widget is embedded on external sites, a multi-layered wakeup system is implemented:

### Cold Start Mitigation Strategy

Our approach follows Vercel AI SDK best practices for minimizing cold start impact:

1. **Proactive Warming**:
   - The widget automatically pings the API when it first loads (before user interaction)
   - The wakeup.js script maintains warm functions through periodic pings
   - API routes explicitly set `runtime = 'edge'` for faster cold starts than serverless functions

2. **Graceful Recovery**:
   - The `useAppChat` hook implements automatic retry for the first message if a cold start causes a failure
   - Error states in the UI are clear and informative when cold starts occur
   - Exponential backoff prevents overwhelming the API during recovery

3. **Optimized Response Handling**:
   - The Vercel AI SDK's streaming capabilities show partial responses while the rest is being generated
   - Appropriate timeouts prevent hanging requests during cold starts
   - `onFinish` and `onError` callbacks provide visibility into request completion

### Wakeup Ping Implementation

1. **API Ping Endpoint** (`/api/ping`):
   - Provides a lightweight endpoint for checking service health
   - Wakes up related services (including the widget API) on each request
   - Returns status information about connected services

2. **Component Initialization** (in ChatWidgetV2):
   - First load triggers a warmup request
   - Silent failure ensures the UI isn't affected if the ping fails

3. **Standalone Widget Script** (chat-widget-v2.js):
   - Pings the API during initialization
   - Extracts the base URL from the configured API endpoint

4. **Wakeup Script** (`/widget/wakeup.js`):
   - Optional script that can be embedded on high-traffic pages
   - Sends periodic pings to keep the widget API warm
   - Implements exponential backoff for error handling
   - Reduces cold starts for users interacting with the widget

### Embedding the Wakeup Script

```html
<!-- Marlan Chat Widget Wakeup Script -->
<script src="https://marlan.photographytoprofits.com/widget/wakeup.js" async defer></script>
```

### Configuration Options

The wakeup script can be configured with custom options:

```html
<script>
  window.marlanWakeupConfig = {
    pingInterval: 120000, // 2 minutes
    debug: true           // Enable console logs
  };
</script>
<script src="https://marlan.photographytoprofits.com/widget/wakeup.js" async defer></script>
```

### Usage Recommendations

For optimal performance on external sites:

1. **Include both scripts** on high-traffic pages:
   ```html
   <!-- Widget wakeup script - keeps the API warm -->
   <script src="https://marlan.photographytoprofits.com/widget/wakeup.js" async defer></script>
   
   <!-- Main widget script - loads the chat interface -->
   <script>
     window.marlinChatConfig = {
       position: 'bottom-right',
       title: 'Ask Marlan',
       // other configuration...
     };
     
     var script = document.createElement('script');
     script.src = 'https://marlan.photographytoprofits.com/widget/chat-widget.js';
     script.async = true;
     script.defer = true;
     document.head.appendChild(script);
   </script>
   ```

2. **Place the wakeup script** on your site's most frequently visited page to keep the API warm for all users

## Multiple Domain Support

The widget API includes proper CORS support for the following domains:
- https://marlan.photographytoprofits.com
- https://programs.thehighrollersclub.io
- http://localhost:3000 (for development)

Additional domains can be added by setting the `WIDGET_ALLOWED_ORIGINS` environment variable.

## UI Enhancements

The widget features several UI improvements for a better user experience:

### Message Display
- Smart content overflow handling with `overflow-hidden` and `break-words`
- Properly contained message bubbles that maintain their styling
- Empty assistant messages are not rendered, preventing visual artifacts
- Clear visual distinction between user and assistant messages

### Interaction Feedback
- Clean, minimal "Processing..." indicator during streaming
- Automatic scrolling as new content is generated
- Continuous scroll updates during streaming to keep the latest content visible
- Smooth scroll transitions for a polished feel

### Error Handling
- Clear visual feedback when errors occur
- Simple retry mechanism for failed messages
- Informative rate limit warnings with reset time information

## Backward Compatibility

To ensure existing implementations continue to work:
- `chat-widget.js` is maintained as a symbolic link to `chat-widget-v2.js`
- The API endpoint maintains compatibility with previous request formats
- Embed snippets generated from the previous version continue to function

### Upgraded Components
The widget has been fully refactored to use the Vercel AI SDK:
- Original `chat-widget.tsx` replaced with `chat-widget-v2.tsx`
- Widget JS script refactored to use modern patterns
- Enhanced with continuous scroll monitoring and empty message filtering

## Performance Considerations

- The widget is designed to be lightweight (~20KB gzipped)
- It uses lazy loading to minimize impact on page load times
- All styles are isolated with unique class names to prevent conflicts
- The widget respects user preferences (dark mode, reduced motion, etc.)
- Implements efficient token usage in API calls
- Uses LRU caching for frequently accessed knowledge

## Edge Runtime and Wakeup System

The widget API is implemented using Next.js Edge Runtime for global low-latency deployment and faster startup times. To mitigate cold starts when the widget is embedded on external sites, a multi-layered wakeup system is implemented:

### Cold Start Mitigation Strategy

Our approach follows Vercel AI SDK best practices for minimizing cold start impact:

1. **Proactive Warming**:
   - The widget automatically pings the API when it first loads (before user interaction)
   - The wakeup.js script maintains warm functions through periodic pings
   - API routes explicitly set `runtime = 'edge'` for faster cold starts than serverless functions

2. **Graceful Recovery**:
   - The `useAppChat` hook implements automatic retry for the first message if a cold start causes a failure
   - Error states in the UI are clear and informative when cold starts occur
   - Exponential backoff prevents overwhelming the API during recovery

3. **Optimized Response Handling**:
   - The Vercel AI SDK's streaming capabilities show partial responses while the rest is being generated
   - Appropriate timeouts prevent hanging requests during cold starts
   - `onFinish` and `onError` callbacks provide visibility into request completion

### Wakeup Ping Implementation

1. **API Ping Endpoint** (`/api/ping`):
   - Provides a lightweight endpoint for checking service health
   - Wakes up related services (including the widget API) on each request
   - Returns status information about connected services

2. **Component Initialization** (in ChatWidgetV2):
   - First load triggers a warmup request
   - Silent failure ensures the UI isn't affected if the ping fails

3. **Standalone Widget Script** (chat-widget-v2.js):
   - Pings the API during initialization
   - Extracts the base URL from the configured API endpoint

4. **Wakeup Script** (`/widget/wakeup.js`):
   - Optional script that can be embedded on high-traffic pages
   - Sends periodic pings to keep the widget API warm
   - Implements exponential backoff for error handling
   - Reduces cold starts for users interacting with the widget

### Embedding the Wakeup Script

```html
<!-- Marlan Chat Widget Wakeup Script -->
<script src="https://marlan.photographytoprofits.com/widget/wakeup.js" async defer></script>
```

### Configuration Options

The wakeup script can be configured with custom options:

```html
<script>
  window.marlanWakeupConfig = {
    pingInterval: 120000, // 2 minutes
    debug: true           // Enable console logs
  };
</script>
<script src="https://marlan.photographytoprofits.com/widget/wakeup.js" async defer></script>
```

### Usage Recommendations

For optimal performance on external sites:

1. **Include both scripts** on high-traffic pages:
   ```html
   <!-- Widget wakeup script - keeps the API warm -->
   <script src="https://marlan.photographytoprofits.com/widget/wakeup.js" async defer></script>
   
   <!-- Main widget script - loads the chat interface -->
   <script>
     window.marlinChatConfig = {
       position: 'bottom-right',
       title: 'Ask Marlan',
       // other configuration...
     };
     
     var script = document.createElement('script');
     script.src = 'https://marlan.photographytoprofits.com/widget/chat-widget.js';
     script.async = true;
     script.defer = true;
     document.head.appendChild(script);
   </script>
   ```

2. **Place the wakeup script** on your site's most frequently visited page to keep the API warm for all users

## Multiple Domain Support

The widget API includes proper CORS support for the following domains:
- https://marlan.photographytoprofits.com
- https://programs.thehighrollersclub.io
- http://localhost:3000 (for development)

Additional domains can be added by setting the `WIDGET_ALLOWED_ORIGINS` environment variable. 