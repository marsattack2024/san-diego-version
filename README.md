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
npm install
```

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
WIDGET_ALLOWED_ORIGINS=https://yoursite.com,https://example.com,*
NEXT_PUBLIC_MAX_TOKENS=600
LOG_LEVEL=info
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
3. Click "New Project" in the Vercel dashboard
4. Import your repository
5. Configure the project settings:
   - Framework preset: Next.js
   - Build command: `next build`
   - Install command: `npm install`
   - Output directory: `.next`
6. Add all environment variables from your `.env.local` file
7. Deploy the project

### Post-Deployment Steps

1. Update Supabase Auth settings with your production URL
2. Verify that all API routes are working correctly
3. Test authentication flow in production
4. Test chat functionality with various agent types
5. Test the RAG search functionality

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

### Authentication Issues

- If login fails, ensure Supabase Auth URLs are correctly configured
- For "Invalid JWT" errors, check that your Supabase URL and anon key are correct
- Clear browser cookies if persistent authentication issues occur

### Vector Search Issues

- Ensure the pgvector extension is enabled in your Supabase database
- Verify document embeddings exist in the database
- Check OpenAI API key is correct for embedding generation

### Performance Optimization

- Set a reasonable `NEXT_PUBLIC_MAX_TOKENS` value (recommended: 600-800)
- Enable caching for web scraping and embeddings
- Configure rate limiting based on your expected traffic

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes | - |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key | Yes | - |
| `NEXT_PUBLIC_APP_URL` | Application URL | Yes | - |
| `PERPLEXITY_API_KEY` | Perplexity API key | No | - |
| `WIDGET_ALLOWED_ORIGINS` | Comma-separated list of domains allowed to embed widget | No | `*` |
| `NEXT_PUBLIC_MAX_TOKENS` | Maximum tokens for AI responses | No | `600` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No | `info` |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Additional Documentation

For more detailed information on specific features, see the documentation in the `/docs` directory. 