<think>Let me analyze the simplest way to ensure all tools work regardless of the agent selected. Based on the photography bot example, I can see that their approach is quite straightforward:

1. Agent selection happens in `chooseAgent` function
2. Tool results are injected into the system prompt through the `getSystemPrompt` function 
3. The actual AI call is the same for all agent types in `getSpecialistResponse`

This makes it very clean - all tools work with all agents because:
1. Tool execution is separate from agent selection
2. Tool results are added to the system prompt, not sent through a different channel
3. The same API call pattern is used for all agents

For our implementation, we need to:
1. Decouple agent selection from tool availability
2. Have a consistent way to inject tool results into prompts
3. Use the same core API call pattern for all agents

Let me revise the plan with this simpler approach.</think># Revised Implementation Plan: Ensuring All Tools Work With All Agents

After analyzing the photography bot approach, I can see a much simpler way to ensure all tools work with all agents. Here's my revised plan with implementation phases:

## Core Architecture

The key insight is that tools work with all agents because:
1. Tool execution is completely separate from agent selection
2. Tool results are directly injected into the system prompt
3. The same API call pattern is used for all agents

Here's the revised architecture:

```
User Message → Agent Selection → Tool Execution → Results Added to Prompt → API Call
```

## Phase 1: Agent Configuration (1 Day)

### 1. Create Agent Definition File
```typescript
// lib/agents/agent-config.ts
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';

export interface AgentDefinition {
  id: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  emoji?: string;
}

export const AGENTS: Record<AgentType, AgentDefinition> = {
  'default': {
    id: 'default',
    name: 'General Assistant',
    description: 'All-purpose AI assistant',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    emoji: '🤖'
  },
  // Other agent definitions...
};
```

### 2. Simplify Agent Router
```typescript
// lib/agents/agent-router.ts
import { type Message } from 'ai';
import { AGENTS, type AgentType } from './agent-config';

export class AgentRouter {
  // Get the system prompt for a specific agent, enhanced with tool results
  getSystemPrompt(
    agentType: AgentType, 
    toolResults: { 
      ragContent?: string;
      scrapedContent?: string;
      deepSearchContent?: string;
    } = {}
  ): string {
    const agent = AGENTS[agentType] || AGENTS.default;
    let prompt = agent.systemPrompt;
    
    // Add tool results to the prompt directly
    if (toolResults.deepSearchContent) {
      prompt += `\n\n### RESEARCH INFORMATION:\n${toolResults.deepSearchContent}`;
    }
    
    if (toolResults.ragContent) {
      prompt += `\n\n### KNOWLEDGE BASE RESULTS:\n${toolResults.ragContent}`;
    }
    
    if (toolResults.scrapedContent) {
      prompt += `\n\n### WEB PAGE CONTENT:\n${toolResults.scrapedContent}`;
    }
    
    return prompt;
  }
}
```

## Phase 2: Tool Result Collection (1 Day)

### 1. Collect Tool Results
```typescript
// lib/chat/route.ts (API endpoint)
import { AgentRouter } from '@/lib/agents/agent-router';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { formatToolResults } from '@/lib/chat/tools-formatter';

export async function POST(req: Request) {
  const { messages, agentId } = await req.json();
  const agentRouter = new AgentRouter();
  const toolResults = { ragContent: '', scrapedContent: '', deepSearchContent: '' };
  
  // Extract last user message for tool processing
  const lastUserMessage = messages.findLast(m => m.role === 'user')?.content || '';
  
  // Run tools in parallel if needed
  if (lastUserMessage) {
    // Only process if there's a new user message
    const [ragResult, scrapedResult, deepSearchResult] = await Promise.allSettled([
      processRAG(lastUserMessage),
      processWebScraper(lastUserMessage),
      processDeepSearch(lastUserMessage),
    ]);
    
    // Format results for prompt injection
    if (ragResult.status === 'fulfilled' && ragResult.value) {
      toolResults.ragContent = formatToolResults('rag', ragResult.value);
    }
    
    // Similar for other tools...
  }
  
  // Get enhanced system prompt with tool results
  const systemPrompt = agentRouter.getSystemPrompt(agentId, toolResults);
  
  // Generate response using AI SDK
  return streamText({
    model: openai('gpt-4o', { structuredOutputs: true }),
    system: systemPrompt,
    messages,
    tools: toolDefinitions,
    maxSteps: 3
  }).toDataStreamResponse();
}
```

### 2. Format Tool Results
```typescript
// lib/chat/tools-formatter.ts
export function formatToolResults(toolType: string, result: any): string {
  switch (toolType) {
    case 'rag':
      return `## Knowledge Base Results:\n${result.content}`;
    
    case 'webScraper':
      return `## Web Page: ${result.url}\n${result.title}\n${result.description}\n\n${result.content.substring(0, 1000)}...`;
    
    case 'deepSearch':
      return `## Research Results:\n${result.content}`;
    
    default:
      return '';
  }
}
```

## Phase 3: Tool Execution (1-2 Days)

### 1. Process RAG Results
```typescript
// lib/chat/rag-processor.ts
import { getVectorResults } from '@/lib/vector';

export async function processRAG(query: string) {
  try {
    // Skip processing if query is too short
    if (query.length < 3) return null;
    
    // Get vector results
    const results = await getVectorResults(query);
    
    // Return formatted results
    return {
      content: results.map(r => r.text).join('\n\n'),
      sources: results.map(r => r.metadata)
    };
  } catch (error) {
    console.error('RAG processing error:', error);
    return null;
  }
}
```

### 2. Similar functions for other tools

## Phase 4: UI Integration (1 Day)

### 1. Update Chat Store
```typescript
// stores/chat-store.ts
interface ChatState {
  // Existing properties...
  
  // Clear separation between agent selection and tools
  selectedAgentId: AgentType;
  deepSearchEnabled: boolean;
  toolsEnabled: boolean;
  
  // No coupling between agent type and tool selection
  setSelectedAgent: (agentId: AgentType) => void;
  setDeepSearchEnabled: (enabled: boolean) => void;
  setToolsEnabled: (enabled: boolean) => void;
}
```

### 2. Update Agent Selector Component
```tsx
// components/agent-selector.tsx
export default function AgentSelector() {
  const selectedAgentId = useChatStore(state => state.selectedAgentId);
  const setSelectedAgent = useChatStore(state => state.setSelectedAgent);
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost">
          {AGENTS[selectedAgentId].name}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {Object.values(AGENTS).map(agent => (
          <DropdownMenuItem
            key={agent.id}
            onClick={() => setSelectedAgent(agent.id)}
          >
            {agent.emoji} {agent.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Benefits of This Approach

1. **Simple Integration**: All tools work with all agents because tool outputs are directly injected into the system prompt
2. **Clean Separation**: Agent selection is completely separate from tool availability
3. **Minimal Changes**: We leverage existing code and just modify how tool results feed into prompts
4. **Easy Extension**: New agents only need a system prompt, and they automatically work with all tools

## Key Technical Decisions

1. **Direct Prompt Injection**:
   - Tool results are added directly to the agent's system prompt
   - No need for complex context management system initially

2. **Parallel Tool Processing**:
   - Process all tools concurrently for each user message
   - Results are collected before making the AI call

3. **Independent Configuration**:
   - Agent selection doesn't automatically enable/disable specific tools
   - Users can enable/disable tools independent of agent selection

4. **Simplified Implementation**:
   - No need for a context manager class initially
   - Tool results format is standardized but simple

## Testing Strategy (1 Day)

1. **Verify Tool Independence**:
   - Test each tool with each agent type
   - Confirm results appear in responses regardless of agent

2. **Test Agent Switching**:
   - Switch agents mid-conversation and verify tools still work
   - Check that appropriate agent prompts are used

3. **Check Tool Output Injection**:
   - Validate that tool results appear in the context window
   - Verify that the AI uses tool information appropriately

This implementation follows the successful pattern from your photography bot and ensures all tools work regardless of agent selection by directly injecting tool results into the system prompt. By keeping the implementation simple and focused, we can deliver a reliable solution quickly.

Would you like me to elaborate on any specific part of this plan or make adjustments to better match your needs?
