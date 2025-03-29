# Chat Widget

A lightweight, embeddable chat widget that can be added to any website. This widget leverages the Vercel AI SDK for streaming AI responses with a clean, responsive UI.

## Features

- Real-time message streaming via Vercel AI SDK
- Session persistence across page reloads
- Responsive design for all devices
- Rate limiting support with user feedback
- Customizable appearance and behavior
- Comprehensive error handling
- Accessibility support
- Automatic RAG (Retrieval Augmented Generation) for relevant answers

## Implementation Details

The widget is implemented using a modern approach with the Vercel AI SDK:

1. **`useAppChat` hook** - A wrapper around Vercel AI SDK's `useChat` that adds:
   - Session management with local storage
   - Rate limit handling and detection
   - Custom error messages with retry capability
   - Message history persistence
   - API configuration for different environments

2. **`ChatWidgetV2` component** - The UI component that:
   - Provides a floating chat button
   - Expands to a full chat interface
   - Handles responsive layout and accessibility
   - Displays streaming messages in real-time
   - Supports rich message formatting
   - Includes loading and error states

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

## Technical Architecture

The widget is built with a modular architecture:

- `ChatWidgetV2`: Main component providing the UI
- `useAppChat`: Custom hook integrating with Vercel AI SDK
- `types.ts`: TypeScript interfaces for widget configuration
- `chat-widget-v2.js`: Standalone script for embedding
- `/api/widget-chat/route.ts`: API endpoint handling requests
- `/app/widget.js/route.ts`: Route handler serving the widget script

## Backward Compatibility

To ensure existing implementations continue to work:
- `chat-widget.js` is maintained as a symbolic link to `chat-widget-v2.js`
- The API endpoint maintains compatibility with previous request formats
- Embed snippets generated from the previous version continue to function

## Performance Considerations

- The widget is designed to be lightweight (~20KB gzipped)
- It uses lazy loading to minimize impact on page load times
- All styles are isolated with unique class names to prevent conflicts
- The widget respects user preferences (dark mode, reduced motion, etc.)
- Implements efficient token usage in API calls
- Uses LRU caching for frequently accessed knowledge 