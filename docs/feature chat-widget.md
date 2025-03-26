# Chat Widget Implementation Plan

This document outlines the implementation plan for a custom chat widget that integrates with our existing Marlin AI assistant. The widget is designed to be embedded on a specific subdomain (programs.thehighrollersclub.io) and provide a streamlined chat experience without requiring user authentication.

## Overview

The chat widget will:
- Leverage our existing RAG implementation and agent router
- Maintain conversation history only for the current session
- Use a simplified UI matching Marlin's style
- Include basic rate limiting (3 requests per minute)
- Be embeddable via a simple script tag through Google Tag Manager

## Architecture

### Component Structure

```
/components
  /chat-widget
    /index.tsx            # Main entry point and container component
    /chat-widget-bubble.tsx  # Floating bubble that expands to chat
    /chat-widget-window.tsx  # Chat window with messages and input
    /chat-widget-header.tsx  # Simple header with title/close button
    /chat-widget-messages.tsx # Message display component
    /chat-widget-input.tsx   # Simplified input component
    /chat-widget-provider.tsx # Context provider for state management
    /types.ts             # TypeScript types for the widget

/app
  /api
    /widget-chat
      /route.ts          # API route specific to the widget
    /widget-session
      /route.ts          # Session management for the widget

/lib
  /widget
    /session.ts         # Session management utilities
    /rate-limit.ts      # Rate limiting implementation
    /constants.ts       # Widget-specific constants
    /widget-script.js   # Self-contained widget JavaScript
    /gtm-snippet.html   # Google Tag Manager ready HTML snippet

/public
  /widget
    /chat-widget.js     # Bundled script for embedding
    /styles.css         # Optional external styles
```

### Implementation Status

#### Completed Components

1. **Session Management** - `lib/widget/session.ts`
   - ✅ Session generation and persistence in localStorage
   - ✅ Session expiry logic (24 hours of inactivity)
   - ✅ Functions for adding messages to session

2. **Rate Limiting** - `lib/widget/rate-limit.ts`
   - ✅ Redis-based rate limiting with in-memory fallback
   - ✅ Session ID-based limiting (3 requests per minute)
   - ✅ IP-based fallback when session ID is not available
   - ✅ Appropriate error responses with rate limit information

3. **Widget Types** - `components/chat-widget/types.ts`
   - ✅ TypeScript interfaces for configuration options
   - ✅ Default configuration values
   - ✅ Request/response types for the widget API

4. **Widget Chat API** - `app/api/widget-chat/route.ts`
   - ✅ Integration with rate limiting middleware
   - ✅ Streaming responses using Vercel AI SDK
   - ✅ Simple system prompt for the embedded context
   - ✅ Error handling and logging

5. **Widget Script** - `lib/widget/widget-script.js`
   - ✅ Self-contained JavaScript for creating the widget UI
   - ✅ Dynamic DOM manipulation and styling
   - ✅ Event handling for user interactions
   - ✅ Message streaming and display

6. **GTM Snippet** - `lib/widget/gtm-snippet.html`
   - ✅ Ready-to-use HTML for Google Tag Manager
   - ✅ Asynchronous loading with proper error handling
   - ✅ Integration with dataLayer for analytics
   - ✅ Configurable appearance and behavior

#### Components In Progress

1. **UI Components**
   - ⏳ Main container component
   - ⏳ Chat bubble and window components
   - ⏳ Message display and input components

2. **Context Provider**
   - ⏳ State management for widget UI
   - ⏳ Connection to the widget API

3. **Bundling and Distribution**
   - ⏳ Production bundling of the widget script
   - ⏳ Optimized assets for production

### Technical Implementation Details

#### Widget API (`app/api/widget-chat/route.ts`)

The widget API has been implemented using the Vercel AI SDK and NextJS Edge runtime. Key features:

- **Rate Limiting**: Uses the `rateLimitMiddleware` to enforce limits of 3 requests per minute
- **Session Management**: Accepts and generates session IDs for tracking conversations
- **Streaming Responses**: Uses the Vercel AI SDK's `streamText` function to stream responses from OpenAI
- **Error Handling**: Comprehensive error handling with appropriate status codes and messages

The API is designed to be lightweight and performant, with a max duration of 120 seconds to allow for longer responses when needed.

#### AI SDK and RAG Integration

The widget leverages the Vercel AI SDK and our existing RAG (Retrieval Augmented Generation) system:

- **Vercel AI SDK**: Uses `streamText` function from the AI SDK to generate streaming responses
- **OpenAI Integration**: Connects to OpenAI's models via the `@ai-sdk/openai` provider
- **Stream Processing**: Responses are streamed in real-time using `toDataStreamResponse()`
- **RAG System**: Connects to the same vector database used by the main application
- **Knowledge Base Access**: Retrieves relevant context from our knowledge base to enhance responses
- **Consistent Experience**: Uses the same prompt builder system as the main application for consistent responses

#### Rate Limiting (`lib/widget/rate-limit.ts`)

The rate limiting implementation is robust and flexible:

- **Redis-based**: Primary storage using Redis (via Upstash) when available
- **In-memory Fallback**: Falls back to an in-memory store when Redis is not available
- **Identifier Flexibility**: Uses session ID when available, with IP address as fallback
- **Automatic Cleanup**: Periodically cleans up expired entries from the in-memory store
- **Response Headers**: Returns appropriate rate limit headers (X-RateLimit-*)
- **Detailed Logging**: Includes comprehensive logging for troubleshooting

#### Session Management (`lib/widget/session.ts`)

Session management is handled client-side to minimize server load:

- **UUID Generation**: Creates cryptographically secure UUIDs for session identification
- **LocalStorage Persistence**: Sessions stored in localStorage for persistence across page refreshes
- **Automatic Expiry**: Sessions expire after 24 hours of inactivity
- **Message Management**: Functions for adding messages to the session
- **Error Handling**: Graceful fallback if localStorage is not available

#### Widget Script (`lib/widget/widget-script.js`)

The widget script creates the complete UI and handles all client-side logic:

- **Self-contained**: Injects all necessary HTML and CSS
- **Responsive Design**: Adapts to different screen sizes
- **Customizable**: Configurable appearance and behavior
- **Stream Handling**: Processes streamed responses in real-time
- **Session Management**: Maintains conversation state across page refreshes
- **Error Handling**: Graceful fallback for error conditions

## Google Tag Manager Integration

The chat widget will be designed to be easily deployed via Google Tag Manager (GTM) on the programs.thehighrollersclub.io domain. This approach offers several benefits:

- **No code changes required to the main site**
- **Easy deployment and updates** without developer intervention
- **Centralized management** of the widget configuration

### GTM Implementation Steps

1. **Prepare the Widget Script**:
   - Create a self-contained script that dynamically loads widget resources
   - Ensure the script uses proper scoping to avoid conflicts with the host page
   - Include fallback mechanisms for error handling

2. **Configure Google Tag Manager**:
   - Create a new tag in GTM using Custom HTML tag type
   - Paste the widget initialization script into the HTML field
   - Set up triggers to control where and when the widget appears
   - Test the implementation in GTM's preview mode before publishing

3. **Script Structure**:

```html
<script>
// Use an IIFE (Immediately Invoked Function Expression) for proper scoping
(function() {
  // Dynamically load the widget resources
  var script = document.createElement('script');
  script.src = 'https://your-domain.com/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  
  // Initialize the widget once the script is loaded
  script.onload = function() {
    window.initChatWidget({
      position: 'bottom-right',
      title: 'Ask Marlin',
      primaryColor: '#0070f3'
    });
  };
  
  // Handle loading errors gracefully
  script.onerror = function() {
    console.warn('Failed to load the chat widget');
  };
})();
</script>
```

### GTM Best Practices

For optimal performance and compatibility when deploying through Google Tag Manager:

1. **Asynchronous Loading**:
   - Use `async` and `defer` attributes to prevent blocking page rendering
   - Implement proper event handling for script loading and initialization

2. **Resource Efficiency**:
   - Minimize the initial script size by loading UI components on demand
   - Use lazy loading for resources that aren't immediately needed
   - Implement efficient caching strategies for static assets

3. **Conflict Prevention**:
   - Use namespaced function and variable names
   - Avoid relying on global variables or modifying existing ones
   - Check for existing instances before initializing to prevent duplicates

4. **Tracking and Integration**:
   - Add data attributes to facilitate analytics tracking
   - Implement event triggers that can be captured in GTM
   - Consider implementing custom GTM events for important widget interactions

5. **Error Handling and Logging**:
   - Implement robust error catching and fallback mechanisms
   - Include logging that can help diagnose issues in production
   - Provide meaningful error messages that can guide troubleshooting

## Local Testing Instructions

To test the chat widget locally during development:

### 1. Test the API Endpoint

You can test the API endpoint using curl or Postman:

```bash
curl -X POST http://localhost:3000/api/widget-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how can you help photographers?", "sessionId": "test-session-123"}'
```

This should return a streaming response from the AI.

### 2. Test the Widget UI

To test the widget UI directly:

1. Create a test HTML file in your `public` directory (e.g., `public/widget-test.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Test</title>
</head>
<body>
  <h1>Marlin Chat Widget Test Page</h1>
  <p>The chat widget should appear in the bottom-right corner.</p>
  
  <script>
    window.marlinChatConfig = {
      position: 'bottom-right',
      title: 'Ask Marlin',
      primaryColor: '#0070f3',
      apiEndpoint: 'http://localhost:3000/api/widget-chat'
    };
  </script>
  <script src="/widget/chat-widget.js" async defer></script>
</body>
</html>
```

2. Copy your `widget-script.js` to `public/widget/chat-widget.js`

3. Access the test page at `http://localhost:3000/widget-test.html`

### 3. Test the GTM Implementation

To simulate the GTM implementation locally:

1. Create another test file in `public/widget-gtm-test.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget GTM Test</title>
</head>
<body>
  <h1>Marlin Chat Widget GTM Test Page</h1>
  <p>The chat widget should load via our GTM-like implementation.</p>
  
  <script>
  (function() {
    if (window.marlinChatWidgetLoaded || !window.localStorage) {
      return;
    }
    
    window.marlinChatConfig = {
      position: 'bottom-right',
      title: 'Ask Marlin',
      primaryColor: '#0070f3',
      apiEndpoint: 'http://localhost:3000/api/widget-chat'
    };
    
    var script = document.createElement('script');
    script.src = 'http://localhost:3000/widget/chat-widget.js';
    script.async = true;
    script.defer = true;
    script.onerror = function() {
      console.warn('Failed to load Marlin Chat Widget');
    };
    
    script.onload = function() {
      console.log('Widget script loaded successfully');
      if (window.initChatWidget) {
        window.initChatWidget(window.marlinChatConfig);
      }
    };
    
    document.head.appendChild(script);
  })();
  </script>
</body>
</html>
```

2. Access this test page at `http://localhost:3000/widget-gtm-test.html`

## Embedding Method

The widget will be embeddable via Google Tag Manager using a Custom HTML tag:

1. Log into Google Tag Manager account
2. Navigate to Tags and click "New"
3. Choose "Custom HTML" as the tag type
4. Add the following code to the HTML field (update domains as needed):

```html
<script>
// Use an IIFE for proper scoping
(function() {
  // Skip if already loaded or on unsupported browsers
  if (window.marlinChatWidgetLoaded || !window.localStorage) {
    return;
  }
  
  // Configure the widget
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlin',
    primaryColor: '#0070f3',
    apiEndpoint: 'https://programs.thehighrollersclub.io/api/widget-chat'
  };
  
  // Dynamically load the widget resources
  var script = document.createElement('script');
  script.src = 'https://programs.thehighrollersclub.io/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    console.warn('Failed to load Marlin Chat Widget');
  };
  
  // Track GTM events for analytics
  script.onload = function() {
    if (window.dataLayer) {
      window.dataLayer.push({
        'event': 'marlinChatWidgetLoaded',
        'marlinChatWidget': { 'status': 'loaded' }
      });
    }
    
    if (window.initChatWidget) {
      window.initChatWidget(window.marlinChatConfig);
    }
  };
  
  // Append the script to the document
  document.head.appendChild(script);
})();
</script>
```

5. Set up a trigger for "All Pages" or specific pages as needed
6. Save and publish the changes

## Implementation Progress

- [x] Initial planning and architecture
- [x] Session management
- [x] Rate limiting implementation
- [x] Widget API with Vercel AI SDK
- [x] Widget script implementation
- [x] GTM snippet creation
- [x] Integration with RAG (Retrieval Augmented Generation)
- [ ] Core UI React components
- [ ] Context provider for state management
- [ ] Production bundling and deployment
- [ ] Testing and refinement
- [ ] Documentation

## AI Integration Details

The widget leverages the Vercel AI SDK and our RAG (Retrieval Augmented Generation) system to provide intelligent responses:

### Knowledge Base Integration

- **Automated Knowledge Base Search**: Every query is automatically passed through our vector database to find relevant information
- **Semantic Similarity**: Uses cosine similarity to find the most semantically relevant documents
- **Multi-step Processing**: Uses the AI SDK's multi-step capability to:
  1. Search the knowledge base for relevant documents
  2. Process and format the found information
  3. Generate a human-friendly response based on the retrieved data

### AI Model Configuration

- **Forced Tool Use**: The widget always uses the knowledgeBase tool for every query to ensure information is accurate
- **Strong System Prompt**: Clear instructions ensure the model prioritizes knowledge base information and responds appropriately
- **Fallback Handling**: Graceful responses when no relevant information is found in the knowledge base

### Performance Optimization

- **Document Thresholds**: Only uses documents with >65% similarity to ensure relevancy
- **Top Document Selection**: Only the top 3 most relevant documents are used to keep responses focused
- **Token Efficiency**: Responses are limited to 1000 tokens to optimize costs and response time

## Next Steps

1. Complete the React UI components for potential future enhancements
2. Finalize production bundling of widget script
3. Test in Google Tag Manager on a staging environment
4. Refine the implementation based on testing
5. Deploy to production and monitor performance
6. Create admin analytics dashboard for widget usage

## Technical Considerations

- **Performance**: The widget is designed to be lightweight with minimal dependencies
- **Security**: Rate limiting and input validation protect against abuse
- **Accessibility**: UI components follow WCAG guidelines
- **Error Handling**: Comprehensive error handling with graceful degradation
- **GTM Compatibility**: Special attention to asynchronous loading and conflict prevention
- **AI Integration**: Leverages existing RAG system and Vercel AI SDK for consistent responses
