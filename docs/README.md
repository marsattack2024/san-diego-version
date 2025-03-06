<think>I'll develop a comprehensive architecture document based on the structure I proposed, using available information from the existing documentation and code context. I'll expand each section with detailed technical information, ensuring I cover the ESM implementation, logging architecture, organization principles, Supabase integration, and RAG system thoroughly.</think># AI Chat Interface: Comprehensive Architecture Documentation

## 1. System Overview

### Core Value Proposition
The system delivers an intelligent chat interface that combines multiple AI capabilities: conversational AI, specialized domain expertise through agents, document retrieval via RAG, and web research through DeepSearch. This creates a versatile platform capable of providing contextually rich, accurate responses tailored to user needs across various domains.

### Architecture Principles
- **Modularity**: Components are decoupled and independently testable
- **Progressive Enhancement**: Core functionality works without advanced features
- **Composability**: Systems can be combined flexibly based on user needs
- **Scalability**: Architecture supports growth from MVP to enterprise scale
- **Developer Experience**: Clear patterns and documentation ease onboarding

### System Boundaries & Integrations
- **Primary Integrations**: OpenAI API, Supabase (Auth/Database/Vector)
- **Secondary Integrations**: Perplexity API (DeepSearch), Fireworks AI
- **Client Boundary**: Next.js frontend with React components
- **Server Boundary**: Next.js API routes and server components
- **Data Boundary**: Supabase PostgreSQL with pgvector extension

### Technical Stack Summary
- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript with ESM modules
- **UI**: React with Shadcn/UI components
- **State**: Zustand stores with persistence
- **Auth**: Supabase Auth with JWT
- **Database**: Supabase PostgreSQL
- **Vector Store**: pgvector on Supabase
- **AI Integration**: Vercel AI SDK
- **Deployment**: Vercel platform

## 2. Application Architecture

### Next.js App Router Structure
The application leverages Next.js App Router for server-rendered components and API routes:

```
app/
├── (auth)/             # Auth-related routes (grouped layout)
│   ├── login/         
│   └── signup/        
├── chat/               # Main chat interface
│   ├── [id]/           # Dynamic route for specific conversations
│   └── page.tsx        # Main chat page
├── api/                # API routes
│   ├── auth/           # Authentication endpoints
│   ├── chat/           # Chat message processing
│   ├── document/       # Document management
│   ├── history/        # Chat history operations
│   └── vector-search/  # Vector search operations
├── settings/           # User settings
└── layout.tsx          # Root layout
```

### ESM Implementation Strategy
The codebase uses ECMAScript Modules (ESM) exclusively for better tree-shaking, top-level await support, and future compatibility:

- All files use `.ts`, `.tsx`, or `.mjs` extensions
- Import statements use explicit file extensions
- CommonJS patterns are systematically replaced with ESM equivalents
- Configuration files use ESM syntax (`next.config.mjs`)
- Dynamic imports leverage ESM's lazy-loading capabilities

Example ESM pattern:
```typescript
// Instead of CommonJS require
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

// Instead of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = new URL('.', import.meta.url).pathname;

// Top-level await (ESM feature)
const supabase = await createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Named exports for better tree-shaking
export { functionA, functionB, functionC };
```

### Module Organization & Dependency Graph
The application uses a clear module hierarchy to prevent circular dependencies:

1. **Core Utilities**: Base utilities with no dependencies (`lib/utils`)
2. **Service Adapters**: External service clients (`lib/supabase`, `lib/openai`)
3. **Domain Logic**: Business logic modules (`lib/chat`, `lib/vector`, `lib/agents`)
4. **State Management**: Zustand stores (`stores/`)
5. **Components**: React components (`components/`)
6. **API Routes**: Backend endpoints (`app/api/`)
7. **Pages**: Next.js page components (`app/`)

### Code Organization Standards
The codebase follows a consistent organization approach:

- **Feature-Based**: Colocates related components, hooks, and utilities
- **Clear Imports**: Absolute imports from the root using `@/` prefix
- **Barrel Exports**: Index files export module contents to simplify imports
- **Type Isolation**: Types defined in separate files to prevent circular dependencies
- **Explicit Documentation**: JSDoc comments for public APIs and complex functions

### Directory Structure & Rationale
The app uses a comprehensive directory structure for clear organization:

```
/
├── app/                 # Next.js App Router pages
├── components/          # UI components
│   ├── auth/            # Auth-related components
│   ├── chat/            # Chat interface components
│   ├── layout/          # Layout components
│   ├── shared/          # Shared components
│   └── ui/              # UI primitives (Shadcn)
├── lib/                 # Core utilities & business logic
│   ├── agents/          # Agent implementations
│   │   ├── core/        # Base agent classes
│   │   ├── prompts/     # Agent prompt templates
│   │   ├── specialized/ # Domain-specific agents
│   │   └── tools/       # Agent tool implementations
│   ├── chat/            # Chat logic
│   ├── logger/          # Unified logging system
│   ├── supabase/        # Supabase client
│   └── vector/          # Vector search functionality
├── config/              # Application configuration
├── contexts/            # React contexts
├── hooks/               # React hooks
├── public/              # Static assets
├── scripts/             # Build/development scripts
├── stores/              # State stores (Zustand)
├── styles/              # Global styles
├── types/               # TypeScript types
└── docs/                # Documentation
```

## 3. Authentication & Authorization

### Supabase Auth Integration
The system uses Supabase Auth for user management with JWT-based session handling:

```typescript
// lib/supabase/client.ts - Browser client
export function createBrowserClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// lib/supabase/server.ts - Server client
export async function createServerClient() {
  const cookieStore = cookies();

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
```

### JWT & Session Management
The system implements cookie-based session management:

- **Access Token**: Short-lived JWT stored in `sb-access-token` cookie
- **Refresh Token**: Long-lived token stored in `sb-refresh-token` cookie
- **Token Refresh**: Middleware handles automatic token refreshing
- **Session Verification**: Server-side validation before accessing protected resources

### Security Implementation
Security measures throughout the authentication system:

- **HTTPOnly Cookies**: Prevents JavaScript access to auth tokens
- **CSRF Protection**: Implementation of anti-CSRF measures
- **Content Security Policy**: Restrictive CSP headers
- **Rate Limiting**: Protection against brute force attacks
- **Session Invalidation**: Proper logout and session cleanup

### Row-Level Security Policies
Supabase RLS policies restrict data access based on user identity:

```sql
-- Example RLS policies
-- Chat history access policy
CREATE POLICY "Users can only access their own chats"
ON public.chats
FOR ALL
USING (auth.uid() = user_id);

-- Messages access policy
CREATE POLICY "Users can only access messages from their chats"
ON public.messages
FOR ALL
USING (
  auth.uid() IN (
    SELECT user_id FROM public.chats WHERE id = chat_id
  )
);
```

### User Roles & Permissions
The system implements role-based access:

- **Anonymous**: Limited access to public resources
- **Authenticated**: Basic user with access to own data
- **Premium**: Enhanced rate limits and feature access
- **Admin**: Full system access and management capabilities

## 4. Data Management

### Database Schema Design
The database schema is optimized for the chat application's needs:

```sql
-- Core Tables
CREATE TABLE public.users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  email TEXT UNIQUE,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_active_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users NOT NULL,
  title TEXT,
  agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.chats NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.documents NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}'
);
```

### Supabase Tables & Relationships
The database design leverages Supabase's capabilities:

- **Foreign Key Constraints**: Maintain referential integrity
- **Timestamps**: Automatic creation and update timestamps
- **UUID Primary Keys**: Secure, distributed ID generation
- **JSONB Columns**: Flexible metadata storage
- **Vector Columns**: Embeddings for semantic search

### Data Access Patterns
The application uses consistent data access patterns:

- **Server Components**: Direct database access for initial page load
- **API Routes**: Database interactions for dynamic operations
- **Stored Procedures**: Complex operations moved to database functions
- **Optimistic Updates**: UI updates before server confirmation
- **Smart Caching**: SWR patterns for efficient data fetching

### Migration & Versioning Strategy
Database changes follow a structured approach:

- **Versioned Migrations**: Numbered SQL migration scripts
- **Forward & Rollback**: Each migration has up/down scripts
- **Feature Flags**: New schemas protected behind flags during transition
- **Safe Deployment**: Multi-phase migrations for zero-downtime updates
- **Testing**: Migration testing in staging environments

### Data Retention & Privacy Practices
The system implements privacy-focused data management:

- **Data Retention Policy**: Automated cleanup of old data
- **User Data Export**: API endpoint for GDPR compliance
- **Data Anonymization**: Personal data scrubbing for inactive accounts
- **Audit Logging**: Tracking of sensitive data access
- **Encryption**: Sensitive data encrypted at rest

## 5. State Management

### Zustand Store Architecture
The application uses Zustand for state management with a domain-driven approach:

```typescript
// stores/chat-store.ts
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  sendMessage: (content: string, chatId?: string) => Promise<void>;
  // Additional actions...
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      messages: {},
      
      sendMessage: async (content, chatId) => {
        // Implementation...
      },
      // Additional implementations...
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    }
  )
);

// stores/auth-store.ts
interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Additional actions...
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  session: null,
  isLoading: true,
  
  login: async (email, password) => {
    // Implementation...
  },
  logout: async () => {
    // Implementation...
  },
  // Additional implementations...
}));
```

### State Persistence Strategy
State persistence is selective and secure:

- **Local Storage**: Non-sensitive UI state persisted client-side
- **Selective Persistence**: `partialize` filters sensitive data
- **Server Synchronization**: Critical data synced to Supabase
- **Hydration**: Initial state hydrated from server data
- **Migration**: Version-aware persistence with migration logic

### Optimistic Updates Implementation
The UI remains responsive through optimistic updates:

- **Immediate Feedback**: UI updates before server confirmation
- **Pending States**: Visual indicators for in-progress operations
- **Rollback Capability**: Reversion on server errors
- **Conflict Resolution**: Handling of concurrent modifications
- **Transaction Boundaries**: Clear delineation of atomic operations

### Client-Server State Synchronization
The application maintains consistency between client and server states:

- **Event-Driven Updates**: State changes trigger server sync
- **Debounce & Throttle**: Rate-limiting for frequent updates
- **Differential Sync**: Only changed data transmitted
- **Conflict Detection**: Timestamp-based concurrency control
- **Recovery Mechanism**: Resilient handling of network issues

### State Debugging Tools
Development experience is enhanced with debugging capabilities:

- **Redux DevTools Integration**: Timeline visualization for Zustand
- **Logging Middleware**: State transitions logged in development
- **Serializable State**: Guaranteed serializable state for debugging
- **Time-Travel Debugging**: History of state changes
- **Action Tracing**: Tracking which actions modified state

## 6. AI Subsystem

### Vercel AI SDK Implementation
The system uses Vercel AI SDK for model interaction and streaming:

```typescript
// api/chat/route.ts
export async function POST(req: Request) {
  const { messages, tool, model, chatId } = await req.json();
  const formattedMessages = formatMessages(messages);

  return streamText({
    model: model || defaultModel,
    provider: getAIProvider(model),
    messages: formattedMessages,
    tools: getToolDefinitions(tool),
    temperature: 0.7,
    tool_choice: "auto"
  });
}

// lib/ai/text-stream.ts
export async function streamText(params) {
  const { 
    messages, 
    model, 
    provider, 
    temperature = 0.7, 
    tools, 
    tool_choice 
  } = params;

  // Configure streaming with appropriate provider
  const response = await OpenAIStream({
    model,
    messages,
    temperature,
    tools,
    tool_choice,
    stream: true,
  });

  // Return streamable response
  return new StreamingTextResponse(response);
}
```

### Provider Strategy Pattern
The system supports multiple AI providers through a strategy pattern:

```typescript
// lib/ai/providers.ts
export interface AIProvider {
  getCompletion(params: CompletionParams): Promise<AIResponse>;
  streamCompletion(params: CompletionParams): Promise<ReadableStream>;
}

export class OpenAIProvider implements AIProvider {
  // Implementation...
}

export class FireworksAIProvider implements AIProvider {
  // Implementation...
}

export function getAIProvider(model?: string): AIProvider {
  // Select provider based on model or configuration
  if (model?.startsWith('fw-')) {
    return new FireworksAIProvider();
  }
  return new OpenAIProvider();
}
```

### Model Selection & Fallback Logic
The system intelligently selects and falls back between models:

- **Default Model**: GPT-4o for optimal performance
- **Fallback Chain**: Sequential fallback to available models
- **Cost Optimization**: Selection based on query complexity
- **Capability Detection**: Feature detection for specialized models
- **User Preferences**: Respects user model choice when available

### Streaming Implementation
Response streaming delivers real-time user experience:

- **Server-Sent Events**: Efficient one-way streaming
- **Chunked Transfer**: Token-by-token streaming to UI
- **Progressive Rendering**: Immediate display of partial responses
- **Cancellation Support**: Client can abort in-progress requests
- **Backpressure Handling**: Flow control for network constraints

### Token Usage Optimization
The system carefully manages token usage for cost efficiency:

- **Message Truncation**: Historical messages pruned to fit context window
- **Summarization**: Long conversations summarized to save tokens
- **Embedding Caching**: Reuse of embeddings for similar content
- **Token Counting**: Accurate estimation before API calls
- **Chunking Strategy**: Optimal document segmentation for retrieval

### Prompt Engineering Standards
Prompts follow consistent engineering practices:

- **Templating System**: Dynamic prompt assembly from components
- **Few-Shot Examples**: Inclusion of exemplars for complex tasks
- **Clear Instructions**: Explicit formatting instructions
- **Consistent Formatting**: Standard delimiters and markers
- **Version Control**: Prompt versioning and A/B testing

## 7. RAG System Architecture

### Vector Database Implementation
The system uses Supabase's pgvector for similarity search:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document chunks table with vector column
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.documents NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}'
);

-- Create vector index for efficient similarity search
CREATE INDEX ON public.document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Embedding Generation & Management
The system efficiently generates and manages embeddings:

```typescript
// lib/vector/embeddings.ts
export async function generateEmbedding(text: string): Promise<number[]> {
  const cachedEmbedding = await getFromCache(createHash(text));
  if (cachedEmbedding) return cachedEmbedding;

  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [text],
    encoding_format: "float"
  });

  await saveToCache(createHash(text), embedding.data[0].embedding);
  return embedding.data[0].embedding;
}

export async function storeDocumentEmbeddings(
  documentId: string, 
  chunks: DocumentChunk[]
): Promise<void> {
  // Generate embeddings in parallel with rate limiting
  const embeddingPromises = chunks.map(
    async (chunk, i) => {
      const embedding = await generateEmbedding(chunk.content);
      return { ...chunk, embedding };
    }
  );

  // Process in batches to avoid overwhelming the database
  const chunksWithEmbeddings = await Promise.all(embeddingPromises);
  await storeChunksInDatabase(documentId, chunksWithEmbeddings);
}
```

### Chunking Strategy & Optimization
Documents are optimally chunked for retrieval:

- **Semantic Chunking**: Division at natural semantic boundaries
- **Overlap Strategy**: Chunks overlap to prevent context loss at boundaries
- **Size Calibration**: Chunk size optimized for embedding model
- **Metadata Enrichment**: Chunks tagged with structural information
- **Hierarchical Chunking**: Multi-level chunking for different retrieval scenarios

### Hybrid Search Implementation
The system combines semantic and keyword search for optimal results:

```typescript
// lib/vector/documentRetrieval.ts
export async function hybridSearch(
  query: string,
  filters: SearchFilters = {},
  limit: number = 5
): Promise<SearchResult[]> {
  // Generate query embedding
  const embedding = await generateEmbedding(query);
  
  // Extract keywords for traditional search
  const keywords = extractKeywords(query);
  
  // Perform vector similarity search
  const vectorResults = await vectorSearch(embedding, filters, limit * 2);
  
  // Perform keyword search
  const keywordResults = await keywordSearch(keywords, filters, limit * 2);
  
  // Combine and re-rank results
  const combinedResults = mergeAndRankResults(
    vectorResults, 
    keywordResults,
    query
  );
  
  return combinedResults.slice(0, limit);
}
```

### Context Window Management
The system optimally manages the LLM context window:

- **Dynamic Allocation**: Context divided between history, retrieved documents, and system instructions
- **Importance Weighting**: Critical information prioritized in limited context
- **Information Density**: Content preprocessing to increase density
- **Token Budgeting**: Precise allocation of tokens to components
- **Adaptive Retrieval**: Query-dependent retrieval depth

### DeepSearch Integration
The system enhances RAG with Perplexity DeepSearch:

```typescript
// lib/agents/tools/deep-search-tool.ts
export async function deepSearch(query: string): Promise<SearchResult> {
  const response = await fetch("https://api.perplexity.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      include_citations: true
    })
  });
  
  const data = await response.json();
  
  // Process and format results
  return {
    answer: data.answer,
    sources: data.sources.map(formatSource),
    follow_up_questions: data.follow_up_questions
  };
}
```

## 8. Multi-Agent Framework

### Agent Base Implementation
A flexible base class underpins all agents:

```typescript
// lib/agents/core/agent-base.ts
export abstract class AgentBase {
  protected name: string;
  protected description: string;
  protected systemPrompt: string;
  protected toolDefinitions: ToolDefinition[];
  
  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.toolDefinitions = config.tools || [];
  }
  
  abstract prepare(messages: Message[]): Promise<Message[]>;
  
  async getSystemMessage(): Promise<SystemMessage> {
    return {
      role: "system",
      content: this.systemPrompt
    };
  }
  
  getTools(): ToolDefinition[] {
    return this.toolDefinitions;
  }
}
```

### Agent Router & Orchestration
The system dynamically routes queries to appropriate agents:

```typescript
// lib/agents/core/agent-router.ts
export class AgentRouter {
  private agents: Record<string, AgentBase>;
  private defaultAgent: AgentBase;
  
  constructor(agents: Record<string, AgentBase>, defaultAgentKey: string) {
    this.agents = agents;
    this.defaultAgent = agents[defaultAgentKey];
  }
  
  async routeQuery(
    messages: Message[], 
    selectedAgent?: string
  ): Promise<{
    agent: AgentBase,
    preparedMessages: Message[]
  }> {
    // Use selected agent or determine from message content
    const agent = selectedAgent 
      ? this.agents[selectedAgent] || this.defaultAgent
      : this.determineAgent(messages);
    
    // Let agent prepare messages (add context, etc.)
    const preparedMessages = await agent.prepare(messages);
    
    return {
      agent,
      preparedMessages
    };
  }
  
  private determineAgent(messages: Message[]): AgentBase {
    // Implement agent selection logic based on message content
    const userMessage = messages.findLast(m => m.role === "user")?.content || "";
    
    // Simple keyword matching for demo purposes
    if (userMessage.toLowerCase().includes("google ads")) {
      return this.agents["googleAds"] || this.defaultAgent;
    }
    
    // Default fallback
    return this.defaultAgent;
  }
}
```

### Specialized Agent Design Patterns
The system includes domain-specific agents:

```typescript
// lib/agents/specialized/google-ads-agent.ts
export class GoogleAdsAgent extends AgentBase {
  constructor() {
    super({
      name: "Google Ads Expert",
      description: "Specialized in Google Ads campaign optimization",
      systemPrompt: `You are an expert in Google Ads with deep knowledge of...`,
      tools: [
        getInformationTool,
        deepSearchTool,
        googleAdsPoliciesCheckTool
      ]
    });
  }
  
  async prepare(messages: Message[]): Promise<Message[]> {
    // Add relevant Google Ads context to the conversation
    const enhancedMessages = [...messages];
    
    // Add specialized context if needed
    const userMessage = messages.findLast(m => m.role === "user")?.content || "";
    if (userMessage.includes("campaign performance")) {
      const context = await this.fetchCampaignBestPractices();
      enhancedMessages.unshift({
        role: "system",
        content: `Consider these best practices: ${context}`
      });
    }
    
    return enhancedMessages;
  }
  
  private async fetchCampaignBestPractices(): Promise<string> {
    // Implementation to fetch relevant best practices
    return "...";
  }
}
```

### Context Preservation Between Agents
The system maintains conversational context during agent switches:

- **Conversation Summary**: Compact representation of chat history
- **Knowledge Sharing**: Common knowledge base accessible to all agents
- **Context Transfer**: Explicit handoff of important context
- **State Isolation**: Agent-specific state when needed
- **Cross-Agent Memory**: Persistent facts across agent boundaries

### Conversation Memory Management
The system implements sophisticated conversation memory:

- **Short-Term Memory**: Full recent conversation
- **Long-Term Memory**: Vector database of past interactions
- **Episodic Memory**: Notable events and outcomes
- **Semantic Memory**: Extracted facts and relationships
- **Working Memory**: Active information for current task

### Agent Selection & Switching Logic
Users can control agent selection with intelligent assistance:

- **Manual Selection**: Explicit agent choice through UI
- **Auto-Detection**: Content-based agent suggestion
- **Hybrid Approach**: System suggestions with user confirmation
- **Seamless Transitions**: Smooth handoff between agents
- **Specialization Discovery**: Surfacing relevant agent capabilities

## 9. UI Component Architecture

### Component Hierarchy
The UI follows a structured component hierarchy:

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── UserMenu
│   └── Footer
├── Chat
│   ├── ChatHeader
│   │   ├── ConversationTitle
│   │   └── AgentSelector
│   ├── ChatBody
│   │   ├── MessageList
│   │   │   └── MessageItem
│   │   │       ├── UserMessage
│   │   │       ├── AssistantMessage
│   │   │       │   ├── MessageContent
│   │   │       │   │   ├── TextContent
│   │   │       │   │   ├── CodeBlock
│   │   │       │   │   └── ImageContent
│   │   │       │   └── MessageActions
│   │   │       └── SystemMessage
│   │   └── ScrollManager
│   └── ChatInput
│       ├── TextEditor
│       ├── AttachmentButton
│       │   └── FileUploader
│       ├── CommandPalette
│       └── SendButton
└── Sidebar
    ├── ConversationList
    │   └── ConversationItem
    ├── NewChatButton
    └── Settings
```

### Shadcn Implementation
The UI builds on Shadcn's component library:

```typescript
// components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground...",
        destructive: "bg-destructive text-destructive-foreground...",
        outline: "border border-input bg-background...",
        // Additional variants...
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

### Design System & Theming
The application uses a comprehensive design system:

- **Theme Configuration**: Tailwind-based theming with dark/light modes
- **Color Palette**: Semantic color variables with contrast checking
- **Typography Scale**: Consistent type hierarchy and scaling
- **Spacing System**: Proportional spacing variables
- **Component Variants**: Consistent variant patterns across components
- **Animation Tokens**: Standardized animation timing and easing

### Responsiveness Strategy
The UI adapts seamlessly across devices:

- **Mobile-First Approach**: Base styles for mobile with progressive enhancement
- **Responsive Grid**: Flexible grid system using CSS Grid
- **Breakpoint System**: Consistent media query breakpoints
- **Component Adaptations**: Components modify layout at breakpoints
- **Touch Optimization**: Larger touch targets on mobile
- **Viewport Awareness**: Layout adjustments based on available space

### Accessibility Implementations
The system prioritizes accessibility:

- **ARIA Attributes**: Proper role and state management
- **Keyboard Navigation**: Full keyboard support with visible focus
- **Screen Reader Support**: Semantic markup with appropriate labels
- **Color Contrast**: WCAG AA compliance for text contrast
- **Reduced Motion**: Respects user motion preferences
- **Focus Management**: Proper focus trapping and restoration

### Component Testing Approach
UI components undergo comprehensive testing:

- **Unit Tests**: Individual component functionality
- **Integration Tests**: Component interaction testing
- **Visual Regression**: Screenshot comparison across changes
- **Accessibility Tests**: Automated a11y compliance checking
- **Storybook Documentation**: Interactive component documentation
- **User Testing**: Systematic testing with real users

## 10. Tool System

### Tool Definition Framework
The system uses a flexible tool definition framework:

```typescript
// lib/chat/tools.ts
import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (params: any) => Promise<any>;
}

// Example tool definition
export const getInformationTool: ToolDefinition = {
  name: "getInformation",
  description: "Search for information in the user's documents",
  schema: z.object({
    query: z.string().describe("The search query to find relevant information"),
    maxResults: z.number().optional().describe("Maximum number of results to return")
  }),
  execute: async ({ query, maxResults = 5 }) => {
    return await vectorSearch(query, {}, maxResults);
  }
};

export function getToolDefinitions(enabledTool?: string): ChatCompletionTool[] {
  return Object.entries(tools)
    .filter(([name]) => !enabledTool || enabledTool === name)
    .map(([name, tool]) => ({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.schema)
      }
    }));
}
```

### Function Calling Implementation
The system orchestrates AI function calling:

```typescript
// lib/chat/function-calling.ts
export async function handleFunctionCalling(
  message: Message,
  availableTools: Record<string, ToolDefinition>
): Promise<Message> {
  if (!message.tool_calls || message.tool_calls.length === 0) {
    return message;
  }

  const results = await Promise.all(
    message.tool_calls.map(async (toolCall) => {
      const { name, arguments: argsString } = toolCall.function;
      const tool = availableTools[name];
      
      if (!tool) {
        return {
          tool_call_id: toolCall.id,
          role: "tool",
          content: `Error: Tool "${name}" not found`
        };
      }
      
      try {
        // Parse arguments according to schema
        const args = tool.schema.parse(JSON.parse(argsString));
        
        // Execute tool
        const result = await tool.execute(args);
        
        return {
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result)
        };
      } catch (error) {
        return {
          tool_call_id: toolCall.id,
          role: "tool",
          content: `Error: ${error.message}`
        };
      }
    })
  );
  
  return {
    ...message,
    function_results: results
  };
}
```

### Tool Registration & Discovery
The system implements dynamic tool management:

- **Tool Registry**: Central registry of available tools
- **Dynamic Loading**: On-demand tool initialization
- **Capability Advertising**: Tools self-describe capabilities
- **Permission System**: Access control for sensitive tools
- **Tool Dependencies**: Handling of tool requirements and dependencies

### Parameter Validation & Safety
The system enforces strict tool parameter validation:

- **Schema Validation**: Zod schemas for parameter checking
- **Type Coercion**: Intelligent conversion of parameter types
- **Default Values**: Sensible defaults for optional parameters
- **Boundary Checking**: Value range validation
- **Input Sanitization**: Prevention of injection attacks
- **Quota Enforcement**: Usage limits per user/session

### Error Handling & Fallbacks
The system gracefully handles tool execution failures:

- **Error Classification**: Categorization of error types
- **Graceful Degradation**: Fallback mechanisms when tools fail
- **User-Friendly Messages**: Clear error explanations
- **Recovery Suggestions**: Actionable advice for resolving errors
- **Partial Results**: Return of partial data when available
- **Retries and Backoff**: Automatic retries for transient errors

### Tool Performance Metrics
The system monitors tool performance:

- **Execution Time**: Tracking of tool response times
- **Success Rate**: Monitoring of success/failure ratios
- **Usage Patterns**: Analysis of tool invocation patterns
- **Resource Consumption**: Measurement of compute/memory usage
- **Cost Analysis**: Token usage and API cost tracking

## 11. API Design

### REST Endpoint Architecture
The API follows REST principles with consistent patterns:

```
/api/
├── auth/
│   ├── login        # POST: Authenticate user
│   ├── logout       # POST: End session
│   ├── refresh      # POST: Refresh token
│   └── register     # POST: Create account
├── chat/
│   ├── route        # POST: Process messages
│   ├── history      # GET: Retrieve chat history
│   └── [id]/
│       ├── route    # GET/PUT/DELETE: Manage specific chat
│       └── messages # GET: Get messages for chat
├── document/
│   ├── route        # POST: Upload document, GET: List documents
│   ├── [id]/route   # GET/PUT/DELETE: Manage specific document
│   └── chunk        # POST: Manually chunk document
├── vector-search/
│   └── route        # POST: Perform vector search
└── user/
    ├── profile      # GET/PUT: User profile
    └── settings     # GET/PUT: User settings
```

### Route Handler Implementation
API routes use consistent implementation patterns:

```typescript
// app/api/chat/route.ts
import { createServerClient } from '@/lib/supabase/server';
import { streamText } from '@/lib/ai/text-stream';
import { NextResponse } from 'next/server';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    // Authenticate request
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const { messages, tool, model, chatId } = await req.json();
    
    // Log request (excluding sensitive data)
    apiLogger.info('Chat request received', {
      userId: user.id,
      chatId,
      modelRequested: model
    });
    
    // Process request
    return streamText({
      model: model || defaultModel,
      provider: getAIProvider(model),
      messages: formatMessages(messages),
      tools: getToolDefinitions(tool),
      temperature: 0.7,
      tool_choice: "auto"
    });
  } catch (error) {
    apiLogger.error('Error in chat API', { error });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Rate Limiting & Protection
The API implements robust protection measures:

- **Rate Limiting**: Request limiting by user and endpoint
- **Token Bucket Algorithm**: Fair queueing for requests
- **API Keys**: Optional API key authentication for external access
- **CORS Configuration**: Proper cross-origin restriction
- **Request Validation**: Schema validation for all inputs
- **Response Size Limits**: Maximum response size enforcement

### Error Handling Standards
The API follows consistent error handling patterns:

```typescript
// lib/api/error-handler.ts
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export class Api
