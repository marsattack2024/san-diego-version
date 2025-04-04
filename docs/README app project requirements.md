# San Diego Project Requirements Document (PRD)

## 1. Project Overview

**Marlan - The Photo Profit Bot** is an AI-powered chat application designed specifically for marketing assistance to portrait photographers. The application leverages GPT-4o models via the Vercel AI SDK, enhanced with retrieval-augmented generation (RAG), web scraping capabilities, and deep web search functionality through the Perplexity API. Marlan specializes in providing photographers with targeted marketing advice, content creation, and business guidance.

## 2. Core Functionality

### 2.1 Authentication and User Management
- Secure authentication using Supabase Auth with JWT-based session handling
- User profile creation and management for photographers with business details
- Photography business context appended to system prompts to personalize AI interactions
- Website URL scraping and automatic summary generation for comprehensive studio context
- Admin portal for user management with profile creation capabilities

### 2.2 AI Conversation Capabilities
- Chat interface with streaming responses using Vercel AI SDK
- Specialized agent types (default, copywriting, Google Ads, Facebook Ads, quiz) for photography marketing
- Automatic agent selection based on keyword scoring and content analysis
- System prompts enhanced with user profile business context, website summaries, and location information
- Message history saved to database for continuity between sessions
- Tool usage indication in responses for transparency

### 2.3 Knowledge Enhancement Features
- RAG (Retrieval Augmented Generation) using Supabase with pgvector extension
- Automatic URL detection and comprehensive web scraping of relevant links
- Content caching for improved performance and reduced API costs
- Deep web search via Perplexity API (sonar/sonar-pro models) when explicitly enabled
- Prioritized context combining profile information, RAG results, web scraping, and DeepSearch
- Real-time progress indicators for search operations

## 3. Technical Architecture

### 3.1 Frontend
- Next.js 15 App Router with TypeScript and ESM module system
- React with shadcn/ui components for UI consistency using Radix UI primitives
- Responsive design for all device sizes with Tailwind CSS
- Client-side state management with Zustand stores
- Server-Side Events for real-time DeepSearch progress tracking

### 3.2 Backend
- Next.js API routes for serverless functionality
- Supabase for authentication, database, and vector search
- Multi-tier rate limiting for API protection (auth, AI, general API)
- Edge middleware for session validation, profile checks, and token refresh
- Efficient caching layers for web content, embeddings, and API responses

### 3.3 AI Integration
- Vercel AI SDK for model interaction and streaming
- OpenAI models (gpt-4o) with function calling capabilities
- Dynamic tool registration and invocation system
- Perplexity integration (sonar/sonar-pro) for web research with improved context
- Custom agent router with keyword scoring for intelligent routing

### 3.4 Data Management
- Supabase PostgreSQL database with pgvector extension for semantic search
- Efficient data structures for messages, conversations, profiles, and vector embeddings
- Row-level security policies for data protection
- LRU (Least Recently Used) cache for scraped content and formatted responses
- Real-time logging with structured format for debugging and monitoring

## 4. Key User Flows

### 4.1 User Onboarding
1. User signs up via email authentication
2. Upon first login, user is redirected to profile setup page
3. User completes profile with business details (full name, company name, description, location)
4. Website URL can be provided for automatic content scraping and summary generation
5. System processes website in background and generates a concise business summary
6. Once profile is complete, user is directed to the chat interface
7. Profile information is automatically included in all future AI interactions

### 4.2 Chat Interaction
1. User selects agent type (or uses auto-detection)
2. User sends a message query
3. System analyzes query using keyword scoring to determine appropriate specialized agent
4. If URLs are detected, content is automatically scraped and processed
5. If Deep Search is enabled, Perplexity API is called with progress tracking
6. Results from knowledge sources are prioritized (RAG → Web Scraping → Deep Search)
7. AI generates a streaming response with reference to tools used
8. Conversation is saved to history for future context and continuity

### 4.3 Website Summarization
1. User provides their photography business website URL in profile
2. System automatically scrapes the website content using the comprehensive scraper
3. Content is processed with AI to generate a focused summary of the photography business
4. Summary emphasizes key business aspects: services, style, specialization, and geography
5. Website summary is stored with user profile and included in all future AI interactions
6. Summary provides context without requiring repeated explanations from the user

## 5. Feature Requirements

### 5.1 Agent Selection System
- Auto-detection of query intent to route to specialized agents
- Keyword scoring system with bonuses for exact matches and position
- Manual agent selection through UI dropdown
- Specialized agents for different photography marketing needs:
  - Default (general marketing assistant)
  - Copywriting (landing pages, emails, marketing materials)
  - Google Ads (campaign creation and optimization)
  - Facebook Ads (social media advertising)
  - Quiz (interactive content creation)

### 5.2 Web Integration Features
- Automatic URL detection and content extraction
- Comprehensive web scraping with LRU caching
- Content formatting with headers, paragraphs, and contact information extraction
- Deep search toggle for enhanced research capabilities via Perplexity API
- Real-time progress indicators for search operations using Server-Sent Events
- Timeout handling for external API calls to ensure responsive user experience

### 5.3 User Profile Enhancement
- Photography business context added to system prompts
- Website summary generation for relevant interactions
- Location-aware responses for regional marketing advice
- Company description and full business context in all interactions
- Profile updates reflected immediately in AI interactions
- Admin capability to create placeholder profiles for users

### 5.4 Administrative Functions
- User management portal for admins
- Ability to create profiles for existing users
- Monitoring and analytics for system usage
- Rate limit management and adjustment
- User role management (admin/standard)

## 6. Technical Requirements

### 6.1 Performance
- Streaming responses for immediate feedback
- Optimized vector search for fast retrieval
- LRU caching for frequently accessed web content and embeddings
- Token usage optimization with prompt engineering
- Timeout handling for external API calls
- Content truncation for optimal processing speed

### 6.2 Security
- JWT authentication with secure cookie handling
- Environment variable protection for API keys
- Multi-tier rate limiting to prevent abuse
- Row-level security in database
- Content filtering and safety measures
- Secure webhook handling

### 6.3 Scalability
- Serverless architecture for easy scaling
- Efficient database queries with proper indexing
- Modular code organization with ESM modules
- Asynchronous processing for CPU-intensive operations
- Edge functions for global distribution
- Background processing for non-critical operations

### 6.4 Monitoring
- Comprehensive structured logging system
- Error tracking and reporting
- Performance metrics collection (timing, token usage)
- Operation IDs for request tracing
- Usage analytics for feature optimization

## 7. Implementation Phases

### Phase 1: Core Chat Functionality ✓
- Authentication system with Supabase ✓
- Basic chat interface with Vercel AI SDK ✓
- User profile creation flow ✓
- Simple agent selection ✓

### Phase 2: Enhanced Context Features ✓
- RAG implementation with vector search ✓
- Web scraping capabilities ✓
- Agent auto-routing system ✓
- Profile context in prompts ✓
- Website summarization ✓

### Phase 3: Advanced Research Capabilities ✓
- Deep Search integration with Perplexity ✓
- Real-time progress tracking ✓
- Enhanced prompt engineering ✓
- Admin portal and management tools ✓

### Phase 4: Optimization and Extension
- Performance improvements
- Additional specialized agents
- Advanced analytics dashboard
- Mobile optimization
- Image generation capabilities
- Multi-language support

## 8. Success Metrics

- User engagement and retention
- Quality of AI responses measured through feedback
- System performance and response times
- Tool usage distribution and effectiveness
- Conversation completion rates
- Website summary quality and accuracy
- Agent routing accuracy
- Customer satisfaction with marketing advice
