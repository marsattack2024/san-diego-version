# Chat Widget Documentation

The Marlan Chat Widget is a flexible, embeddable chat interface that allows users to interact with your knowledge base through a conversational AI. This widget is designed to be lightweight, customizable, and resilient to various error conditions.

## Features

- **Streaming Responses**: Real-time streaming of AI responses for a more interactive experience
- **Robust Error Handling**: Graceful handling of timeouts, rate limits, network issues, and API errors
- **Rate Limiting**: Built-in rate limiting with user feedback about limits and reset times
- **Message Retry**: Ability to retry failed messages without re-typing
- **Session Management**: Persistent sessions across page loads
- **Customizable UI**: Configurable colors, positions, and text content
- **Mobile Friendly**: Responsive design that works on all device sizes
- **Accessibility**: Keyboard navigation and screen reader support

## Implementation

The chat widget is implemented as a React component that can be easily added to any page. It uses a streaming response API to provide real-time feedback to users and includes comprehensive error handling to ensure a smooth user experience.

### API Integration

The widget communicates with the `/api/widget-chat` endpoint, which is responsible for:

1. **Rate Limiting**: Preventing excessive requests (10 per minute per session)
2. **Authentication**: Optional user authentication
3. **AI Integration**: Processing queries through the Vercel AI SDK
4. **Knowledge Base Search**: Retrieving relevant information from the vector database
5. **Response Streaming**: Delivering responses in real-time

### Error Handling

The chat widget handles various error scenarios, including:

- **Timeouts**: If the AI takes too long to respond (>30 seconds)
- **Rate Limits**: When a user exceeds their allowed message quota
- **Network Issues**: When the connection to the server is lost
- **Server Errors**: When the API returns a 500-level error

Each error type has a specific user-friendly message and, where appropriate, guidance on how to resolve the issue.

## Rate Limiting

To prevent abuse and ensure fair usage, the chat widget implements rate limiting:

- **Default Limit**: 10 messages per minute per session
- **Reset Period**: 60 seconds from the first request
- **User Feedback**: Clear indication when rate limits are hit, with a countdown to when messages can be sent again
- **Graceful Degradation**: The widget remains functional but prevents new messages when rate limited

## Technical Considerations

### Performance Optimizations

1. **Reduced Token Count**: Responses are limited to 400 tokens to ensure quick responses
2. **Timeout Management**: Requests automatically timeout after 30 seconds
3. **Stream Processing**: Efficient handling of streamed responses with minimal UI updates

### Error Resilience

1. **Retry Mechanism**: Failed messages can be retried up to 3 times
2. **Fallback Content**: Appropriate fallback messages when knowledge base content isn't found
3. **Connection Recovery**: Automatic handling of temporary connection issues

## Deployment Considerations

When deploying the chat widget in production, consider the following:

1. **Edge Function Limits**: The widget API is deployed as an Edge Function with a 30-second timeout
2. **Redis Requirements**: Rate limiting requires Redis (Vercel KV or self-hosted)
3. **CORS Configuration**: Ensure proper CORS settings if embedding on external sites
4. **Environment Variables**: Set appropriate environment variables for AI provider and Redis

## Integration

To add the chat widget to your site, import and use the `ChatWidget` component:

```jsx
import { ChatWidget } from '@/components/chat-widget/chat-widget';

export default function Page() {
  return (
    <main>
      <h1>My Website</h1>
      <p>Content goes here...</p>
      
      {/* Add the chat widget */}
      <ChatWidget 
        primaryColor="#052b4c"
        position="right"
        title="Chat with Marlan"
        subtitle="Get answers to your photography questions"
      />
    </main>
  );
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | `/api/widget-chat` | API endpoint for chat requests |
| `primaryColor` | string | `#052b4c` | Primary color for widget buttons and header |
| `position` | `'right'` or `'left'` | `'right'` | Position of widget on screen |
| `title` | string | `'Chat with Marlan'` | Title displayed in widget header |
| `subtitle` | string | `'Get answers to your photography questions'` | Subtitle displayed in widget header |
| `placeholder` | string | `'Type your message here...'` | Placeholder text for input |
| `initialMessage` | string | `'Hi there! How can I help you today?'` | First message from assistant |
| `siteId` | string | `'default'` | Site identifier (for multi-site setups) |

## Troubleshooting

### Common Issues

1. **Widget responses timing out**
   - Cause: AI generation taking too long
   - Solution: Reduce query complexity or increase timeout settings

2. **Rate limit errors**
   - Cause: Too many requests in a short period
   - Solution: Implement queuing or increase rate limits

3. **"Something went wrong" errors**
   - Cause: Usually server-side issues
   - Solution: Check server logs for specific error details

### Debugging

For debugging issues with the chat widget, check:

1. Browser console for client-side errors
2. Server logs for API errors
3. Redis/rate limiting logs for rate limiting issues

## Best Practices

1. **Prompt Optimization**: Design clear instructions for how to use the chat
2. **Knowledge Base Quality**: Ensure your knowledge base content is high-quality and relevant
3. **Response Speed**: Optimize for faster responses (reduced token count, simpler prompts)
4. **User Guidance**: Provide example questions to help users understand what they can ask 