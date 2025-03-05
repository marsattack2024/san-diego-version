# Multi-Agent Architecture Implementation

This document outlines the implementation of a multi-agent system for our application, featuring specialized agents for different domains:

- Default Agent (General purpose)
- Google Ads Agent
- Facebook Ads Agent
- Copywriting Agent
- Quiz Agent

## Architecture Overview

The system follows the Orchestrator-Worker pattern, where:

1. The `AgentRouter` acts as the orchestrator, directing queries to the appropriate specialized agent
2. Each specialized agent is a worker optimized for specific tasks
3. The system uses shared tools but allows for agent-specific customization
4. The router maintains conversation context and handles agent switching

## Implementation Status

### Phase 1: Core Architecture ✅
- Define base agent interfaces and types ✅
- Create the agent router for orchestration ✅
- Implement the base agent class with common functionality ✅
- Set up logging infrastructure for agents ✅
- Create agent context management ✅

### Phase 2: Specialized Agents ✅
- Implement the Default Agent ✅
- Implement the Google Ads Agent ✅
- Implement the Facebook Ads Agent ✅
- Implement the Copywriting Agent ✅
- Implement the Quiz Agent ✅
- Create system prompts for each agent ✅

### Phase 3: UI Components ✅
- Create agent selector component ✅
- Implement chat interface ✅
- Add agent switching functionality ✅
- Develop message display components ✅

### Phase 4: Tools and Capabilities ⏳
- Implement specialized tools for each agent
  - Web scraping tool ✅
  - URL detection tool ✅
  - Web search capabilities ✅
  - DeepSearch with Perplexity API ✅
  - DeepSearch UI integration ✅
  - Combined search tool ✅
  - Supabase integration for data persistence ⏳

### Phase 5: Enhancements and Optimizations ⏳
- Implement agent suggestion based on message content ⏳
- Add analytics for agent performance ⏳
- Optimize token usage and response times ⏳
- Implement caching for search results ⏳
- Add streaming responses for all agents ✅

## Core Components

### Agent Types and Interfaces

The system defines clear interfaces for agents, messages, and tools:

```typescript
// Agent type definition
export type AgentType = 'default' | 'google-ads' | 'facebook-ads' | 'copywriting' | 'quiz';

// Agent interface
export interface Agent {
  id: AgentType;
  name: string;
  description: string;
  capabilities: string[];
  icon: string;
  systemPrompt: string;
  tools: AgentTool[];
  
  processMessage(message: string, context: AgentContext): Promise<AgentResponse>;
}

// Agent message interface
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

// Agent context interface
export interface AgentContext {
  sessionId: string;
  conversationId: string;
  history: AgentMessage[];
  metadata: Record<string, any>;
}

// Agent tool interface
export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodType<any, any>;
  execute: (params: any) => Promise<any>;
}
```

### Base Agent Implementation

The `BaseAgent` class provides common functionality for all agents:

```typescript
export abstract class BaseAgent implements Agent {
  abstract id: AgentType;
  abstract name: string;
  abstract description: string;
  abstract capabilities: string[];
  abstract icon: string;
  abstract systemPrompt: string;
  abstract tools: AgentTool[];
  
  async processMessage(
    message: string, 
    context: AgentContext
  ): Promise<AgentResponse> {
    const logger = createAgentLogger(this.id, {
      sessionId: context.sessionId,
      conversationId: context.conversationId
    });
    
    const startTime = performance.now();
    
    // Create user message and add to context
    const userMessage = createAgentMessage('user', message);
    context.history.push(userMessage);
    
    try {
      // Convert agent tools to AI SDK tools format
      const aiTools = this.tools.reduce((acc, t) => {
        acc[t.name] = tool({
          description: t.description,
          parameters: t.schema,
          execute: async (params) => {
            // Tool execution logic
            return await t.execute(params);
          }
        });
        return acc;
      }, {} as Record<string, any>);
      
      // Generate response using AI SDK
      const { text, toolCalls, usage } = await generateText({
        model: openai('gpt-4o'),
        system: this.systemPrompt,
        prompt: this.formatPrompt(context),
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5
      });
      
      // Create assistant message
      const assistantMessage = createAgentMessage('assistant', text, { toolCalls });
      
      // Add assistant message to context
      context.history.push(assistantMessage);
      
      const endTime = performance.now();
      const processingTimeMs = Math.round(endTime - startTime);
      
      return {
        message: assistantMessage,
        toolCalls,
        usage,
        processingTimeMs
      };
    } catch (error) {
      // Error handling logic
    }
  }
  
  protected formatPrompt(context: AgentContext): string {
    // Format the prompt based on conversation history
    const formattedHistory = context.history
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
    
    return formattedHistory;
  }
}
```

### Agent Router

The `AgentRouter` orchestrates the multi-agent system:

```typescript
export class AgentRouter {
  private agents: Map<AgentType, Agent> = new Map();
  private logger = createRouterLogger();
  
  constructor() {
    this.agents = new Map();
    this.logger.info('Initializing agent router');
  }
  
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.logger.info({ agentId: agent.id }, `Registered agent: ${agent.name}`);
  }
  
  registerAgents(agents: Agent[]): void {
    agents.forEach(agent => this.registerAgent(agent));
    this.logger.info({ count: agents.length }, `Registered ${agents.length} agents`);
  }
  
  getAgent(type: AgentType): Agent {
    const agent = this.agents.get(type);
    if (!agent) {
      this.logger.error({ agentType: type }, `Agent type "${type}" not found`);
      throw new Error(`Agent type "${type}" not found`);
    }
    return agent;
  }
  
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
  
  async routeMessage(
    message: string, 
    context: AgentContext, 
    agentType: AgentType = 'default'
  ): Promise<AgentResponse> {
    this.logger.info({
      agentType,
      sessionId: context.sessionId,
      conversationId: context.conversationId
    }, `Routing message to ${agentType} agent`);
    
    try {
      // Check if we need to switch agents
      if (context.metadata.currentAgentId && context.metadata.currentAgentId !== agentType) {
        const previousAgentId = context.metadata.currentAgentId;
        
        // Add a system message about the agent change
        const systemMessage = createAgentMessage(
          'system',
          `Switching from ${previousAgentId} agent to ${agentType} agent`
        );
        
        context.history.push(systemMessage);
        this.logger.info({
          previousAgentId,
          newAgentId: agentType
        }, `Switching agents from ${previousAgentId} to ${agentType}`);
      }
      
      // Update current agent in context
      context.metadata.currentAgentId = agentType;
      
      // Get the agent and process the message
      const agent = this.getAgent(agentType);
      return await agent.processMessage(message, context);
    } catch (error) {
      // Error handling logic
    }
  }
  
  async suggestAgent(message: string): Promise<AgentType> {
    this.logger.debug({ messageLength: message.length }, 'Suggesting agent for message');
    
    // For now, just return default agent
    // In a real implementation, this would use an LLM to classify the message
    return 'default';
  }
}
```

## Specialized Agents

### Default Agent

A general-purpose assistant that can handle various tasks and recommend specialized agents when appropriate.

```typescript
export class DefaultAgent extends BaseAgent {
  id: AgentType = 'default';
  name = 'General Assistant';
  description = 'A versatile assistant that can help with a wide range of tasks';
  capabilities = [
    'Answer general questions',
    'Provide information on various topics',
    'Assist with basic tasks',
    'Scrape and analyze web content',
    'Perform web searches for up-to-date information',
    'Conduct deep research on complex topics',
    'Recommend other specialized agents when appropriate'
  ];
  icon = 'bot';
  systemPrompt = DEFAULT_SYSTEM_PROMPT;
  tools = [
    echoTool, 
    dateTimeTool, 
    webScraperTool, 
    urlDetectionTool,
    webSearchTool,
    deepSearchTool,
    combinedSearchTool
  ];
  
  private logger = createAgentLogger(this.id);
  
  constructor() {
    super();
    this.logger.info('Default agent initialized');
  }
  
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);
    
    // Add a hint about specialized agents if appropriate
    const enhancedPrompt = `${basePrompt}

If you think another specialized agent would be better suited to help with this request, please let me know. I can connect you with:
- Google Ads Agent for advertising on Google
- Facebook Ads Agent for social media advertising
- Copywriting Agent for marketing content
- Quiz Agent for creating interactive quizzes

I can also help you analyze web content and perform searches. If you provide a URL, I'll automatically scrape it. If you need up-to-date information, I can perform web searches or conduct deep research on complex topics.`;
    
    return enhancedPrompt;
  }
}
```

Similar implementations exist for the Google Ads Agent, Facebook Ads Agent, Copywriting Agent, and Quiz Agent.

## UI Components

### Agent Selector

A dropdown component for selecting different agents:

```typescript
export function AgentSelector({ selectedAgent, onAgentChange }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedOption = agentOptions.find(option => option.id === selectedAgent) || agentOptions[0];
  
  const handleSelect = (agentId: AgentType) => {
    logger.info({ agentId, previousAgent: selectedAgent }, 'Agent selected');
    onAgentChange(agentId);
    setIsOpen(false);
  };
  
  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center justify-between w-full p-3 border rounded-md bg-white"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <span className="text-xl mr-2">{selectedOption.icon}</span>
          <div>
            <div className="font-medium">{selectedOption.name}</div>
            <div className="text-sm text-gray-500">{selectedOption.description}</div>
          </div>
        </div>
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
          {agentOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`flex items-center w-full p-3 text-left hover:bg-gray-100 ${
                option.id === selectedAgent ? 'bg-blue-50' : ''
              }`}
              onClick={() => handleSelect(option.id)}
            >
              <span className="text-xl mr-2">{option.icon}</span>
              <div>
                <div className="font-medium">{option.name}</div>
                <div className="text-sm text-gray-500">{option.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Chat Interface

The main component orchestrating the chat experience:

```typescript
export function ChatInterface() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('default');
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
  
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/chat',
    body: {
      agentId: selectedAgent,
      deepSearch: deepSearchEnabled
    },
    onResponse: (response) => {
      logger.debug('Chat response received');
    },
    onError: (error) => {
      logger.error({ error }, 'Error in chat');
    }
  });
  
  const handleAgentChange = (agentId: AgentType) => {
    logger.info({ agentId }, 'Switching agent');
    setSelectedAgent(agentId);
  };
  
  const handleDeepSearchToggle = (enabled: boolean) => {
    logger.info('Deep search setting changed', { enabled });
    setDeepSearchEnabled(enabled);
  };
  
  // Render chat UI with agent selector, messages, and input
}
```

### DeepSearch Toggle

A toggle component for enabling/disabling deep search:

```typescript
interface DeepSearchToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function DeepSearchToggle({ enabled, onToggle }: DeepSearchToggleProps) {
  return (
    <Button
      variant={enabled ? "default" : "outline"}
      size="sm"
      onClick={() => onToggle(!enabled)}
      className="gap-2"
      title={enabled ? "Deep search is enabled" : "Deep search is disabled"}
    >
      <Search className="h-4 w-4" />
      {enabled ? "DeepSearch On" : "DeepSearch Off"}
    </Button>
  );
}
```

## API Integration

The system includes a Next.js API route at `/api/chat` that processes chat messages:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { messages, agentId, deepSearch = false } = await req.json();
    
    // Validate input
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }
    
    // Convert messages to the format expected by our agents
    const formattedMessages = messages.map((message: Message) => ({
      role: message.role,
      content: message.content,
      id: message.id,
      createdAt: new Date()
    }));
    
    // Create agent context
    const context = createAgentContext(formattedMessages, {
      deepSearch
    });
    
    // Get the latest user message
    const latestMessage = messages[messages.length - 1].content;
    
    // Check if we need to perform a deep search
    if (deepSearch && latestMessage) {
      logger.info('Deep search enabled, performing combined search');
      
      try {
        // This uses the Perplexity API through the combinedSearchTool
        // It works with any text query without requiring URLs
        const searchResult = await combinedSearchTool.execute({
          query: latestMessage
        });
        
        // Add search results to context
        const searchMessage = createAgentMessage(
          'system',
          `Search results for: "${latestMessage}"\n\n${JSON.stringify(searchResult, null, 2)}`
        );
        
        context.history.push(searchMessage);
        
        logger.info('Added search results to context');
      } catch (error) {
        logger.error({ error }, 'Error performing deep search');
      }
    }
    
    // Process the message with the appropriate agent
    const targetAgentId = (agentId as AgentType) || 'default';
    const response = await agentRouter.routeMessage(latestMessage, context, targetAgentId);
    
    // Return the response
    return NextResponse.json({
      role: 'assistant',
      content: response.message.content,
      id: response.message.id,
      createdAt: response.message.createdAt
    });
  } catch (error) {
    // Handle errors
    logger.error({ error }, 'Error processing chat request');
    
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
```

### DeepSearch Button Implementation

The DeepSearch button in the chat interface specifically activates the Perplexity API for comprehensive research:

```typescript
export function DeepSearchButton({ 
  handleSearch, 
  query, 
  disabled = false 
}: DeepSearchButtonProps) {
  const [isSearching, setIsSearching] = useState(false);
  
  const handleClick = async () => {
    if (!query || isSearching) return;
    
    setIsSearching(true);
    logger.info({ query }, 'DeepSearch initiated');
    
    try {
      await handleSearch(query);
      logger.info('DeepSearch completed successfully');
    } catch (error) {
      logger.error({ error }, 'DeepSearch failed');
    } finally {
      setIsSearching(false);
    }
  };
  
  const isDisabled = disabled || isSearching || !query.trim();
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isDisabled}
      className="gap-2"
    >
      {isSearching ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching...
        </>
      ) : (
        <>
          <Search className="h-4 w-4" />
          DeepSearch
        </>
      )}
    </Button>
  );
}
```

When the DeepSearch button is clicked:
1. It sends the current query to the Perplexity API via the API route
2. The API processes the query using the combinedSearchTool
3. The results are added to the conversation context
4. The agent can then use this enhanced context to provide more comprehensive responses

This implementation is separate from the URL detection and web scraping functionality. The DeepSearch feature works with any text query and doesn't require URLs to be present in the message. It's specifically designed to leverage the Perplexity API for in-depth research on topics that might not be easily addressed through basic web searches or content scraping.

### How DeepSearch Works with the Chat Interface

In the `ChatInterface` component, the DeepSearch toggle controls whether the Perplexity API is used for each message:

```typescript
export function ChatInterface() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('default');
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
  
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/chat',
    body: {
      agentId: selectedAgent,
      deepSearch: deepSearchEnabled  // This flag activates the Perplexity API
    },
    onResponse: (response) => {
      logger.debug('Chat response received');
    },
    onError: (error) => {
      logger.error({ error }, 'Error in chat');
    }
  });
  
  const handleDeepSearchToggle = (enabled: boolean) => {
    logger.info('Deep search setting changed', { enabled });
    setDeepSearchEnabled(enabled);
  };
  
  // Render UI with DeepSearchToggle component
  return (
    <div className="chat-container">
      <div className="agent-selector">
        <AgentSelector 
          selectedAgent={selectedAgent} 
          onAgentChange={handleAgentChange} 
        />
      </div>
      
      <div className="messages">
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isLoading && <LoadingMessage />}
      </div>
      
      <div className="input-area">
        <form onSubmit={handleSubmit}>
          <ChatInput 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            disabled={isLoading} 
          />
          <div className="actions">
            <DeepSearchToggle 
              enabled={deepSearchEnabled} 
              onToggle={handleDeepSearchToggle} 
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              Send
            </Button>
          </div>
        </form>
      </div>
      
      {error && <ErrorMessage error={error} />}
    </div>
  );
}
```

## Specialized Tools

### Web Scraping Tool

The system includes a web scraping tool that allows agents to extract content from URLs:

```typescript
export const webScraperTool = createBasicTool(
  'webScraper',
  'Scrapes content from a URL. Extracts the title, description, and main content.',
  z.object({
    url: z.string().describe('The URL to scrape. Will be automatically detected if not provided.'),
  }),
  async ({ url }) => {
    return await scrapeUrl(url);
  }
);
```

### URL Detection Tool

```typescript
export const urlDetectionTool = createBasicTool(
  'detectAndScrapeUrls',
  'Automatically detects URLs in text and scrapes their content.',
  z.object({
    text: z.string().describe('The text that may contain URLs'),
  }),
  async ({ text }) => {
    const urls = extractUrls(text);
    
    if (urls.length === 0) {
      return {
        detected: false,
        message: 'No URLs detected in the text',
        urls: []
      };
    }
    
    // Only scrape the first URL to avoid overloading
    const firstUrl = urls[0];
    const scrapedContent = await scrapeUrl(firstUrl);
    
    return {
      detected: true,
      message: `Detected ${urls.length} URLs. Scraped the first one: ${firstUrl}`,
      urls,
      scrapedContent
    };
  }
);
```

### Web Search Tool

```typescript
export const webSearchTool = createBasicTool(
  'webSearch',
  'Performs a basic web search and returns the top results with snippets.',
  z.object({
    query: z.string().describe('The search query to find information about.'),
  }),
  async ({ query }) => {
    // Basic web search implementation
    // Returns a list of search results with titles, URLs, and snippets
  }
);
```

### DeepSearch Tool

```typescript
export const deepSearchTool = createBasicTool(
  'deepSearch',
  'Performs a deep search using Perplexity API to gather comprehensive information on a topic.',
  z.object({
    query: z.string().describe('The search query to find detailed information about.'),
  }),
  async ({ query }) => {
    try {
      // Get API key from environment variables
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      // Create OpenAI client with Perplexity base URL
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.perplexity.ai',
      });
      
      // Make the API call to Perplexity
      const response = await client.chat.completions.create({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a deep research agent for an agent team. Please bring back the most comprehensive and relevant context in your searches.'
          },
          {
            role: 'user',
            content: query
          }
        ]
      });
      
      return {
        success: true,
        content: response.choices[0].message.content,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      logger.error('Error performing deep search', { error });
      return {
        error: true,
        message: `DeepSearch failed: ${error.message}`,
        results: []
      };
    }
  }
);
```

The DeepSearch tool leverages the Perplexity API to perform comprehensive research on any topic. It works with plain text queries like "research Miami" and does not require URLs to be present. The DeepSearch toggle in the UI specifically activates this feature. When enabled, it enhances the agent's context with comprehensive research results. It's completely separate from the web scraping functionality, which only works with URLs.

### Combined Search Tool

```typescript
export const combinedSearchTool = createBasicTool(
  'combinedSearch',
  'Performs both a web search and a deep search using Perplexity API, combining the results for comprehensive information.',
  z.object({
    query: z.string().describe('The search query to find information about.'),
  }),
  async ({ query }) => {
    // Run both searches in parallel
    const [webSearchResult, deepSearchResult] = await Promise.allSettled([
      webSearchTool.execute({ query }),
      deepSearchTool.execute({ query })
    ]);
    
    // Process web search results
    const webResults = webSearchResult.status === 'fulfilled' 
      ? webSearchResult.value 
      : { error: true, message: 'Web search failed', results: [] };
    
    // Process deep search results
    const deepResults = deepSearchResult.status === 'fulfilled'
      ? deepSearchResult.value
      : { error: true, message: 'Deep search failed', content: '' };
    
    return {
      webSearch: webResults,
      deepSearch: deepResults,
      combinedSummary: `Combined results for "${query}" from both web search and deep research.`
    };
  }
);
```

The Combined Search tool runs both a standard web search and a DeepSearch (using Perplexity API) in parallel, then combines the results. This provides both quick reference information from web search results and comprehensive research from the Perplexity API.

## Understanding Search Tools

Our multi-agent system implements several distinct search-related tools that serve different purposes:

### Tool Distinctions

1. **Web Scraping Tool (`webScraperTool`)**
   - **Purpose**: Extract content from specific URLs
   - **When it's used**: Only when a URL is explicitly provided
   - **How it works**: Takes a URL, fetches the page content, and extracts relevant information
   - **Example use case**: "Can you analyze the content at https://example.com/page"

2. **URL Detection Tool (`urlDetectionTool`)**
   - **Purpose**: Find URLs in text and automatically scrape them
   - **When it's used**: When processing any message that might contain URLs
   - **How it works**: Scans text for URL patterns, then uses the web scraper on detected URLs
   - **Example use case**: "I found this interesting article: https://example.com/article"

3. **Web Search Tool (`webSearchTool`)**
   - **Purpose**: Perform basic web searches for information
   - **When it's used**: When needing general information from the web
   - **How it works**: Sends a query to a search API and returns a list of results with snippets
   - **Example use case**: "What are the top restaurants in Miami?"

4. **DeepSearch Tool (`deepSearchTool`)**
   - **Purpose**: Perform comprehensive research using the Perplexity API
   - **When it's used**: When the DeepSearch toggle is enabled
   - **How it works**: Sends the query to Perplexity's AI-powered search API for in-depth analysis
   - **Example use case**: "Research the impact of climate change on coastal cities"

5. **Combined Search Tool (`combinedSearchTool`)**
   - **Purpose**: Leverage both web search and DeepSearch simultaneously
   - **When it's used**: When DeepSearch is enabled in the chat interface
   - **How it works**: Runs both search types in parallel and combines the results
   - **Example use case**: Any query where both quick results and in-depth analysis are valuable

### Key Points About DeepSearch

- DeepSearch is powered by the Perplexity API, which provides AI-enhanced research capabilities
- It works with plain text queries like "research Miami" and does not require URLs to be present
- The DeepSearch toggle in the UI specifically activates this feature
- When enabled, it enhances the agent's context with comprehensive research results
- It's completely separate from the web scraping functionality, which only works with URLs

### How These Tools Work Together

1. When a user sends a message with DeepSearch disabled:
   - The URL detection tool checks for URLs and scrapes them if found
   - The agent processes the message with its standard tools

2. When a user sends a message with DeepSearch enabled:
   - The combined search tool is triggered, which:
     - Performs a basic web search
     - Performs a deep search using the Perplexity API
     - Combines these results
   - The URL detection tool still checks for URLs and scrapes them if found
   - The agent processes the message with the enhanced context from both sources

This approach provides flexibility for different types of queries while ensuring that the most relevant information is available to the agent when responding to the user.

## Next Steps

1. **Agent Suggestion System**:
   - Implement an intelligent agent suggestion system that analyzes user messages and recommends the most appropriate agent
   - Use an LLM to classify messages and determine the best agent for the task
   - Add a UI component to suggest agent switches to users

2. **Analytics and Monitoring**:
   - Implement analytics to track agent usage and performance
   - Monitor token usage and response times
   - Create dashboards for visualizing agent metrics

3. **Caching and Optimization**:
   - Implement caching for search results to improve performance
   - Optimize token usage by refining prompts and context management
   - Add streaming responses for all agents

4. **Supabase Integration**:
   - Implement Supabase integration for data persistence
   - Store conversation history and user preferences
   - Create agent-specific data stores

5. **Enhanced Tool Development**:
   - Develop more specialized tools for each agent
   - Create content generation tools for the Copywriting Agent
   - Implement ad campaign analysis tools for the Google Ads and Facebook Ads Agents
   - Build quiz creation and management tools for the Quiz Agent

6. **UI Enhancements**:
   - Improve the chat interface with better message rendering
   - Add support for rich content (images, links, etc.)
   - Implement a better mobile experience

## Conclusion

Our multi-agent system provides a flexible and powerful framework for building conversational AI applications with specialized capabilities. The architecture allows for easy addition of new agent types and tools, making it highly adaptable to different use cases.

The implementation of the DeepSearch tool and the combined search capabilities significantly enhances the system's ability to provide up-to-date and comprehensive information. The agent routing system ensures that users can easily switch between different specialized agents based on their needs.

Future enhancements will focus on improving the intelligence of the agent suggestion system, optimizing performance, and adding more specialized tools for each agent type. 