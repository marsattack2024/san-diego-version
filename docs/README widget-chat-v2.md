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
- Uses an enhanced request handling pattern for reliable processing:
  - Route handler parses and validates the request body first
  - Pre-parsed body is passed to the chat engine via options parameter
  - Prevents "body already consumed" errors when validating in multiple places
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

## Advanced Implementation Notes

The widget uses a separation of concerns pattern to ensure reliable request handling:

1. **Route Handler Responsibility**:
   - Parses and validates the raw request body
   - Applies widget-specific schema validation
   - Creates a properly configured chat engine instance

2. **Chat Engine Responsibility**:
   - Processes the pre-validated request body
   - Handles streaming response generation
   - Applies consistent error handling
   - Manages content formatting and processing

This pattern ensures that:
- No request body streams are consumed multiple times
- Validation can happen at the appropriate level
- The main chat component remains unchanged
- Widget-specific requirements don't affect the core engine

## API Endpoint

The widget communicates with the `/api/widget-chat` endpoint, which:

- Handles anonymous user sessions
- Processes messages using the unified chat engine
- **Uses GPT-4o-mini model**: Unlike the main chat which uses GPT-4o, the widget specifically utilizes the GPT-4o-mini model for:
  - Faster response times (lower latency)
  - Reduced token costs for embedded contexts
  - Appropriate capability level for widget interactions
- Returns streaming responses with progress indications
- Manages rate limiting with informative feedback
- Provides CORS support for cross-domain embedding
- Implements Vercel AI SDK's tool system for RAG capabilities

This model selection offers an optimal balance of performance and quality for widget interactions, where speed and cost efficiency are particularly important.

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

- The widget uses the lightweight **GPT-4o-mini model** instead of the full GPT-4o for:
  - Lower latency responses (up to 2x faster)
  - Reduced compute costs in embedded contexts
  - Smaller context window appropriate for widget interactions
  - Comparable quality for typical widget use cases
- The widget is designed to be lightweight (~20KB gzipped)
- It uses lazy loading to minimize impact on page load times
- All styles are isolated with unique class names to prevent conflicts
- The widget respects user preferences (dark mode, reduced motion, etc.)
- Implements efficient token usage in API calls
- Uses LRU caching for frequently accessed knowledge

## Testing the Widget Integration

The widget includes comprehensive testing through several approaches:

### Widget API Route Testing

The route handler for `/api/widget-chat` is tested to ensure:

1. **Schema Validation**: Input validation correctly identifies invalid requests
2. **CORS Handling**: Cross-origin requests are properly handled
3. **Model Configuration**: Verification that `gpt-4o-mini` model is correctly configured
4. **Authentication Bypassing**: Anonymous sessions work correctly
5. **Error Handling**: Proper error responses are returned in a widget-friendly format

Example test for verifying GPT-4o-mini model usage:

```typescript
it('should use gpt-4o-mini model for the widget', async () => {
  // Import the POST handler with proper mocking
  const { POST } = await import('@/app/api/widget-chat/route');
  
  // Create a valid request
  const req = new Request('https://example.com/api/widget-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hello from widget',
      sessionId: '123e4567-e89b-12d3-a456-426614174000'
    })
  });
  
  // Call the handler
  await POST(req);
  
  // Verify model configuration
  expect(createChatEngine).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-4o-mini',
      maxTokens: 800,
      temperature: 0.4
    })
  );
});
```

### Testing Considerations

When testing the widget API endpoint:

1. **Proper Mocking**: Mock external dependencies like the Supabase client and logger
2. **Test CORS Headers**: Verify OPTIONS requests return proper CORS headers
3. **Validate Request Schema**: Test against invalid inputs to ensure robust validation
4. **Check Model Configuration**: Ensure GPT-4o-mini is consistently used
5. **Error Handling**: Verify error responses follow the expected format

### Integration Testing

For full integration testing:

1. **End-to-End Tests**: Embed the widget in a test page and verify responses
2. **Cross-Origin Testing**: Test embedding on different domains
3. **Browser Compatibility**: Verify functionality across supported browsers
4. **Rate Limit Testing**: Verify handling of rate-limited responses

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