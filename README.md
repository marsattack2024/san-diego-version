# Marlan - The Photo Profit Bot

An AI-powered chat application designed specifically for marketing assistance to portrait photographers. Marlan leverages GPT-4o models via the Vercel AI SDK, enhanced with retrieval-augmented generation (RAG), web scraping capabilities, and deep web search functionality through the Perplexity API.

## Overview

Marlan is a specialized AI assistant that helps photographers with marketing strategies, content creation, and business guidance. The application combines several AI technologies:

- **Vercel AI SDK**: For streaming AI responses using OpenAI models
- **Retrieval-Augmented Generation (RAG)**: Uses Supabase's pgvector extension to search relevant knowledge base content
- **Web Scraping**: Automatically extracts content from URLs shared in conversations
- **Deep Web Search**: Optional integration with Perplexity API for enhanced research capabilities

## Features

- 💬 Specialized AI agent types (default, copywriting, Google Ads, Facebook Ads, quiz) for photography marketing
- 🔍 Knowledge base search using vector embeddings (RAG)
- 🌐 Automatic URL detection and comprehensive web scraping with content caching
- 📊 Deep web search via Perplexity API with real-time progress tracking
- 🔐 Secure authentication using Supabase Auth
- 👤 User profile creation with photography business context for personalized AI interactions
- 🎨 Modern UI with shadcn/ui components
- 📱 Responsive design for all device sizes using Tailwind CSS
- 📜 Conversation history persistence
- 🔌 Embeddable chat widget for external websites

### Chat Engine with Conditional Tools

The application uses a unified chat engine with conditional tool inclusion, allowing different agent types to have access to specific capabilities:

- **Knowledge Base Tool**: Retrieves information from the internal knowledge base
- **Web Scraper Tool**: Extracts content from web pages to provide context
- **RAG Tool**: Retrieves and generates content using the Retrieval-Augmented Generation approach
- **Deep Search Tool**: Performs web research using the Perplexity API (requires explicit enablement)

### Deep Search Feature

The Deep Search feature enables agents to search the web for up-to-date information using the Perplexity API. This feature follows a service-oriented architecture:

#### Architecture

- **Tool Definition**: `lib/chat-engine/tools/deep-search.ts`
- **Service Layer**: `lib/chat-engine/services/perplexity.service.ts` 
- **Route Handler**: `app/api/perplexity/route.ts`

#### Usage

To use Deep Search:

1. Enable the feature in the chat interface using the toggle control
2. Use an agent type that supports Deep Search capabilities
3. Ask questions that would benefit from up-to-date web information

#### Implementation Notes

The feature includes multiple security controls:
- Conditional tool inclusion based on user preference and agent capability
- System prompt feature flags to reinforce availability
- Runtime verification in the tool's execute function

## Recently Implemented Features

### 1. Client Disconnect Handling

The application now implements Vercel AI SDK's `consumeStream()` pattern to ensure message processing continues even if clients disconnect from the chat. This enhancement brings several key benefits:

- **Improved Reliability**: Chat processing completes fully even when users close their browser tabs
- **Message Persistence**: All messages are saved to the database regardless of client connection status
- **Callback Execution**: `onFinish` callbacks are consistently triggered, ensuring data integrity
- **Better Error Recovery**: Disconnected sessions can be resumed without data loss

The implementation has been applied in both the main chat API route and within the core chat engine to ensure consistent behavior.

### 2. Single Message Optimization

To improve performance and reduce network bandwidth usage, the chat system now implements an optimized message sending pattern:

- **Reduced Network Payload**: Only the latest message is sent from client to server
- **Efficient Message Loading**: Previous messages are loaded directly from the database
- **Implementation Method**: Uses Vercel AI SDK's `experimental_prepareRequestBody` feature
- **Performance Benefits**: Faster responses, especially for long conversations

This optimization works seamlessly with the existing chat functionality while significantly reducing data transfer size.

### 3. Redundant Error Handling Improvements

We've streamlined error handling in the message persistence service to enhance maintainability and reliability:

- **Consistent Error Logging**: A centralized `logError` helper function standardizes error logging
- **Simplified Client Creation**: Consolidated Supabase client creation with proper error handling
- **Improved Fallback Logic**: Enhanced RPC failure recovery with more reliable fallbacks
- **Reduced Code Duplication**: Eliminated redundant error handling patterns throughout the codebase
- **Better Performance Tracking**: Added execution time measurements for all database operations

These improvements make the code more maintainable while ensuring robust error handling in production.

### Deep Search Integration

The application now includes a robust Deep Search feature that leverages the Perplexity API to provide comprehensive web research capabilities. This feature is implemented following Vercel AI SDK best practices with multi-layered controls:

1. **User Toggle Control**: Deep Search only activates when explicitly enabled by the user through the UI toggle.
2. **Agent-Based Availability**: Only specific agent types support Deep Search capability.
3. **Conditional Tool Inclusion**: The Deep Search tool is only included in the available tools set when explicitly enabled.
4. **Self-Verification**: The tool includes an internal verification check to ensure it cannot be misused.

#### Key Components

- `lib/chat-engine/tools/deep-search.ts`: Implementation of the Deep Search tool following Vercel AI SDK patterns
- `lib/chat-engine/tools/registry.ts`: Conditional inclusion of the Deep Search tool based on feature flags
- `app/api/chat/route.ts`: Configuration of the chat engine with conditional Deep Search integration
- `lib/agents/agent-router.ts`: Agent-specific configuration for Deep Search availability

#### Usage

Users can enable Deep Search by toggling the Deep Search button in the chat interface. When enabled and supported by the current agent, the AI can use this tool to perform web research on complex topics, providing more comprehensive and up-to-date information.

### Enhanced Logging System

We've implemented a comprehensive structured logging system designed for clarity and performance:

- 🏷️ **Categorized Logs**: All logs are properly categorized (AUTH, CHAT, TOOLS, LLM, SYSTEM, CACHE)
- 📊 **Smart Sampling**: Production logs use intelligent sampling based on categories (10-20% for routine logs, 100% for errors)
- ⚡ **Performance Metrics**: Automatic tracking of slow operations with threshold-based flagging
- 🔒 **Security-Focused**: Sensitive data is automatically redacted from logs
- 🔍 **Debug Mode**: Verbose development logs with detailed context (filtered in production)
- 📈 **Operation Tracking**: Unique operation IDs for complete request tracing

### Optimized Perplexity Integration

- 🔄 **Efficient Caching**: Redis-based caching system for DeepSearch results with 1-hour TTL
- 🚦 **Timeout Handling**: Improved handling of API timeouts with graceful fallbacks
- 📱 **Real-time Progress**: Enhanced client progress indicators using Server-Sent Events
- 🔍 **Smart Triggers**: Context-aware DeepSearch that runs only when necessary

### Performance Improvements

- 🚀 **Reduced API Load**: Better caching strategy for RAG operations and web scraping
- ⏱️ **Timeout Management**: Proper cancellation of timeouts to prevent redundant operations
- 🧠 **Memory Optimization**: Improved memory usage through cleanup of completed operations
- 📦 **Consolidated Imports**: Dynamic imports to reduce initial load time

## Getting Started

### Prerequisites

- **Node.js**: v18.17.0 or higher (required for Next.js 15)
- **npm**: v9.6.0 or higher
- **Supabase Account**: For database, auth, and vector search functionality
- **OpenAI API Key**: For accessing GPT-4o models
- **Perplexity API Key**: (Optional) For enhanced web search capabilities

### Tech Stack

- **Frontend**: Next.js 15, React 18, Tailwind CSS, shadcn/ui components
- **Backend**: Next.js API routes (serverless functions)
- **Database**: Supabase PostgreSQL with pgvector extension
- **Authentication**: Supabase Auth
- **AI/ML**: OpenAI GPT-4o via Vercel AI SDK, Perplexity API
- **Deployment**: Vercel (recommended)

### Setup Instructions

#### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/marlan.git
cd marlan
```

#### 2. Install Dependencies

```bash
npm install --legacy-peer-deps
```

> **Important**: The `--legacy-peer-deps` flag is required due to a dependency conflict between React 18 and React-Data-Grid which expects React 19. This flag allows npm to complete the installation despite the conflicting requirements.

Note: Some peer dependency warnings may appear but can be safely ignored as they're compatibility notices between Next.js 15 and some packages.

#### 3. Set Up Supabase

1. Create a new Supabase project at [https://supabase.com](https://supabase.com)
2. Enable the pgvector extension in your Supabase database:
   - Go to the SQL Editor
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Create necessary tables using the SQL schema:
   - Copy the SQL from `supabase/schema.sql` into the SQL Editor
   - Execute the SQL to create all required tables and functions

#### 4. Set Up Environment Variables

Create a `.env.local` file in the project root with the following variables:

```
# Required environment variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional environment variables
PERPLEXITY_API_KEY=your_perplexity_api_key
PERPLEXITY_MODEL=sonar  # Default model, 'sonar-pro' is available for premium accounts
WIDGET_ALLOWED_ORIGINS=https://yoursite.com,https://example.com,*
NEXT_PUBLIC_MAX_TOKENS=600
LOG_LEVEL=info  # Options: debug, info, warn, error
```

#### 5. Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application running.

### Database Setup

The application requires the following Supabase tables and extensions:

- `profiles`: Stores user profile information
- `conversations`: Stores conversation metadata
- `messages`: Stores individual messages
- `documents`: Stores knowledge base documents
- `document_sections`: Stores chunked document sections with vector embeddings
- `embeddings`: Stores computed embeddings for vector search

The pgvector extension must be enabled to support vector search capabilities.

## Authentication Setup

1. In your Supabase dashboard, go to Authentication settings
2. Enable Email/Password sign-in method
3. Configure the following Auth URLs:
   - Site URL: `http://localhost:3000` (for development) or your production URL
   - Redirect URLs: Add `http://localhost:3000/auth/callback` and `/login`

## Deployment Guide

### Deploying to Vercel

1. Push your code to a GitHub, GitLab, or Bitbucket repository
2. Create an account on [Vercel](https://vercel.com) if you don't have one
3. Verify your environment variables are configured properly:
   ```bash
   npm run check-vercel
   ```
4. Deploy using our automated script (recommended):
   ```bash
   npm run deploy
   ```
5. Or manually via the Vercel dashboard:
   - Click "New Project" in the Vercel dashboard
   - Import your repository
   - Configure the project settings:
     - Framework preset: Next.js
     - Build command: `next build`
     - Install command: `npm install --legacy-peer-deps` (important to include the flag here too)
     - Output directory: `.next`
   - Add all environment variables from your `.env.local` file
   - Deploy the project

For a detailed deployment checklist, see our [Vercel Deployment Guide](./docs/vercel-deployment-checklist.md).

### Post-Deployment Steps

1. Run automated verification to check all critical endpoints:
   ```bash
   npm run verify-deployment -- --url https://your-deployed-url.vercel.app
   ```
2. Update Supabase Auth settings with your production URL
3. Verify that all API routes are working correctly
4. Test authentication flow in production
5. Test chat functionality with various agent types
6. Test the RAG search functionality

## Chat Widget Integration

Marlan includes an embeddable chat widget that can be integrated into any website:

```html
<script>
(function() {
  window.marlinChatConfig = {
    position: 'bottom-right',
    title: 'Ask Marlan',
    primaryColor: '#0070f3',
    greeting: "I'm your Mastermind AI companion! I can answer marketing and tech questions right now! What can I help with?",
    placeholder: 'Type your message...',
    apiEndpoint: 'https://your-deployed-url.com/api/widget-chat'
  };
  
  var script = document.createElement('script');
  script.src = 'https://your-deployed-url.com/widget/chat-widget.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();
</script>
```

For detailed widget documentation, see [Chat Widget Documentation](./docs/feature%20chat-widget.md).

## Common Issues and Troubleshooting

### Dependency Conflicts

If you encounter dependency errors during installation, particularly with React versions:

```
Could not resolve dependency:
peer react@"^19.0" from react-data-grid@7.0.0-beta.51
node_modules/react-data-grid
  react-data-grid@"^7.0.0-beta.48" from the root project
```

Use one of these solutions:

1. **Recommended**: Install with legacy peer deps flag:
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Alternative**: Downgrade react-data-grid to a version compatible with React 18:
   ```bash
   npm uninstall react-data-grid
   npm install react-data-grid@7.0.0-beta.47 --save
   ```

3. **Last resort**: Force installation (may cause runtime issues):
   ```bash
   npm install --force
   ```

### Authentication Issues

- If login fails, ensure Supabase Auth URLs are correctly configured
- For "Invalid JWT" errors, check that your Supabase URL and anon key are correct
- Clear browser cookies if persistent authentication issues occur

### Vector Search Issues

- Ensure the pgvector extension is enabled in your Supabase database
- Verify document embeddings exist in the database
- Check OpenAI API key is correct for embedding generation

### Perplexity DeepSearch Troubleshooting

- Verify your Perplexity API key is valid and properly configured
- Check that the internal authentication bypass is working correctly in middleware
- For timeout issues, verify the 20-second timeout is configured properly
- If DeepSearch appears to hang, check Server-Sent Events (SSE) connectivity

### Performance Optimization

- Set a reasonable `NEXT_PUBLIC_MAX_TOKENS` value (recommended: 600-800)
- Enable caching for web scraping and embeddings
- Configure rate limiting based on your expected traffic
- Adjust the LOG_LEVEL environment variable to reduce logging in production

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes | - |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key | Yes | - |
| `NEXT_PUBLIC_APP_URL` | Application URL | Yes | - |
| `PERPLEXITY_API_KEY` | Perplexity API key | No | - |
| `PERPLEXITY_MODEL` | Perplexity model name | No | `sonar` |
| `WIDGET_ALLOWED_ORIGINS` | Comma-separated list of domains allowed to embed widget | No | `*` |
| `NEXT_PUBLIC_MAX_TOKENS` | Maximum tokens for AI responses | No | `600` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No | `info` |

## Additional Documentation

For more detailed information on specific features, see the documentation in the `/docs` directory:

- [Logging System](./docs/logging.md) - Detailed documentation on the logging system
- [DeepSearch Integration](./docs/deepsearch.perplexity.md) - How Perplexity DeepSearch is integrated
- [Chat Widget Documentation](./docs/feature%20chat-widget.md) - How to use the embeddable chat widget
- [Route Handler Testing](./docs/README%20route-handler-testing.md) - Best practices for testing Next.js route handlers with Vitest
- [Vercel Deployment Checklist](./docs/vercel-deployment-checklist.md) - Comprehensive checklist for Vercel deployments

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 