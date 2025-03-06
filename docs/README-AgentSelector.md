I'll analyze the architecture and create a comprehensive plan based on your requirements.

### Current Architecture Analysis

1. **Agent Selection System**
```typescript
Components:
- agent-router.ts: Routes messages to specific agents
- agent-selector.tsx: UI component for selecting agents
- chat-store.ts: Stores selected agent state
```

2. **Tool Integration**
```typescript
Current Setup:
- Tools defined in lib/chat/tools.ts
- Each tool (RAG, WebScraper, DeepSearch) works independently
- Tools return data but don't automatically feed into context
```

3. **Context Management**
```typescript
Issues:
- Tool outputs aren't automatically added to conversation context
- No unified context management system
- DeepSearch keywords tied to agent selection
```

### Architectural Problems to Solve

1. **Agent Selection Decoupling**
- Current system ties agent selection to specific keywords
- Tools are implicitly linked to agents
- Need to separate agent selection from tool availability

2. **Tool Integration**
- Tools work independently but don't feed into each other
- No unified context management
- No standardized way to inject tool results into conversation

3. **Context Window Management**
- No clear system for managing context window size
- No prioritization of which tool outputs to keep in context
- No cleanup of old context data

### Proposed Solution Architecture

1. **Agent Context Manager**
```typescript
interface AgentContext {
  conversation: Message[];
  toolResults: {
    rag: string[];
    webScraper: ScrapedContent[];
    deepSearch: string[];
  };
  metadata: {
    selectedAgent: AgentType;
    activeTools: string[];
  };
}
```

2. **Tool Result Processor**
```typescript
interface ToolResultProcessor {
  processRAGResult(result: string): void;
  processWebScraperResult(result: ScrapedContent): void;
  processDeepSearchResult(result: string): void;
  getEnhancedContext(): string;
}
```

3. **Context Window Manager**
```typescript
interface ContextWindowManager {
  addToContext(content: string, priority: number): void;
  optimizeContext(maxTokens: number): string;
  pruneOldContent(): void;
}
```

### Implementation Plan

1. **Phase 1: Decouple Agent Selection**
- Remove DeepSearch keywords from agent selection
- Create clean separation between agent types and tool availability
- Update agent-router.ts to focus only on agent-specific prompts

2. **Phase 2: Create Context Management System**
- Implement ContextWindowManager
- Add token counting and context optimization
- Create priority system for different types of content

3. **Phase 3: Tool Integration**
- Modify each tool to use standardized result format
- Implement ToolResultProcessor
- Create system for automatic context injection

4. **Phase 4: Agent Context Enhancement**
- Implement AgentContext interface
- Create context enhancement pipeline
- Add metadata tracking for tool usage

### Files to Modify

1. **Core Changes**
```typescript
/lib/agents/agent-router.ts
/components/agent-selector.tsx
/lib/chat/tools.ts
/stores/chat-store.ts
```

2. **New Files to Create**
```typescript
/lib/context/context-manager.ts
/lib/context/tool-processor.ts
/lib/context/window-manager.ts
/types/agent-context.ts
```

3. **Configuration Updates**
```typescript
/lib/agents/prompts/
/config/agent-config.ts
```

### Migration Strategy

1. **Stage 1: Infrastructure**
- Create new context management system
- Set up tool result processors
- Implement context window management

2. **Stage 2: Tool Updates**
- Update each tool to use new context system
- Add result processing pipeline
- Implement context injection

3. **Stage 3: Agent Updates**
- Remove DeepSearch keywords
- Update agent selection logic
- Implement new context enhancement

4. **Stage 4: Testing & Optimization**
- Test all tools with different agents
- Verify context management
- Optimize token usage

Would you like me to proceed with implementing any specific phase of this plan?
