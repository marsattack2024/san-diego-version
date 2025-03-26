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

/lib
  /widget
    /session.ts         # Session management utilities
    /rate-limit.ts      # Rate limiting implementation
    /widget-script.js   # Self-contained widget JavaScript
    /gtm-snippet.html   # Google Tag Manager ready HTML snippet

/docs
  /chat-widget.md       # Documentation for the chat widget
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

7. **UI Components**
   - ✅ Main container component (`chat-widget.tsx`)
   - ✅ Context provider for state management (`chat-widget-provider.tsx`)
   - ✅ Root component export (`index.tsx`)
   - ✅ Embed snippet generator (`embed-snippet.tsx`)

8. **Demo & Configuration**
   - ✅ Widget demo page (`app/widget/page.tsx`)
   - ✅ Widget configurator (`app/widget/widget-configurator.tsx`)
   - ✅ Widget script server endpoint (`app/widget.js/route.ts`)

9. **Documentation**
   - ✅ Comprehensive documentation (`docs/chat-widget.md`)

#### Remaining Tasks

1. **Testing and Refinement**
   - ⏳ End-to-end testing of the widget in different environments
   - ⏳ Performance optimization
   - ⏳ Browser compatibility testing

2. **Production Deployment**
   - ⏳ Final bundling and minification
   - ⏳ CDN configuration for the widget script
   - ⏳ GTM deployment in production environment

## Implementation Progress

- [x] Initial planning and architecture
- [x] Session management
- [x] Rate limiting implementation
- [x] Widget API with Vercel AI SDK
- [x] Widget script implementation
- [x] GTM snippet creation
- [x] Integration with RAG (Retrieval Augmented Generation)
- [x] Core UI React components
- [x] Context provider for state management
- [x] Demo page and configurator
- [x] Documentation
- [ ] Production bundling and deployment
- [ ] Final testing and refinement

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
