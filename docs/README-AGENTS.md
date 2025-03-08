# Multi-Agent Architecture Implementation

This document outlines the current implementation of the multi-agent system for our application, detailing its architecture, strengths, limitations, and improvement opportunities.

## Architecture Overview

The system follows an Agent Router pattern with specialized agents:

- **Default Agent**: General-purpose assistant with full tool access
- **Google Ads Agent**: Specialized for Google advertising
- **Facebook Ads Agent**: Specialized for social media advertising
- **Copywriting Agent**: Specialized for marketing content
- **Quiz Agent**: Specialized for creating interactive quizzes

## Current Implementation

### Agent Router

The `AgentRouter` class in `lib/agents/agent-router.ts` selects the appropriate agent based on:

1. **User Selection**: Uses explicitly selected agent if specified
2. **Keyword Matching**: Otherwise analyzes message content using a scoring system:
   - Higher scores for multi-word keywords (2 points/word)
   - Bonus for keywords at start of message (5 points)
   - Bonus for exact phrase matches (3 points)
   - Routes to specialized agent if score exceeds threshold (5)

The router then constructs system prompts by combining base prompts with specialized prompts and tool descriptions.

### Base Agent Infrastructure

- `BaseAgent` abstract class (`lib/agents/core/agent-base.ts`) implements common functionality
- Processes messages by converting tools to AI SDK format and calling OpenAI
- Maintains conversation history and handles errors
- Uses TypeScript interfaces for types like `AgentType`, `AgentMessage`, `AgentContext`

### Current Limitations

The current architecture has some key limitations:

1. **Minimal Tool Differentiation**: 
   - Default agent uses 6 tools: `echoTool`, `dateTimeTool`, `webScraperTool`, `urlDetectionTool`, `deepSearchTool`, `vectorSearchTool`
   - Specialized agents only use `dateTimeTool`

2. **Primarily Prompt-Based Specialization**:
   - Most specialization comes from different system prompts
   - Specialized agents add just one extra line in `formatPrompt()`
   - No significant specialized functionality beyond prompts

3. **Overengineered for Current Implementation**:
   - Complex inheritance hierarchy for what amounts to prompt switching
   - Detailed scoring algorithm for agent selection
   - Extensive infrastructure for minimal functional differences

### Available Tools

The system includes several tools with varying levels of integration:

1. **Core Tools**:
   - `echoTool`: Simple tool for testing
   - `dateTimeTool`: Provides date/time information

2. **Web Interaction Tools**:
   - `webScraperTool`: Extracts content from URLs
   - `urlDetectionTool`: Identifies URLs in text
   - `deepSearchTool`: Uses Perplexity API for research

3. **Knowledge Tools**:
   - `vectorSearchTool`: Searches vector database for information

4. **Web Search Tools** (defined but not actively used):
   - `webSearchTool`: Defined in codebase but not used in any agent
   - `combinedSearchTool`: Combines web search and deep search

## Improvement Opportunities

The system could be improved in several ways:

### 1. Simplify Architecture

```typescript
// A simpler implementation might look like:
class FlexibleAgent {
  constructor() {
    this.tools = [
      echoTool, 
      dateTimeTool, 
      webScraperTool, 
      urlDetectionTool,
      deepSearchTool,
      vectorSearchTool
    ];
  }
  
  async processMessage(message, context) {
    // Determine domain based on message content (simplified routing)
    const domainType = this.determineDomain(message);
    
    // Get appropriate prompt for domain
    const systemPrompt = this.getPromptForDomain(domainType);
    
    // Process with that prompt using the same tools
    // ...
  }
}
```

### 2. True Specialization

If specialized agents are valuable, they should have:

- **Domain-Specific Tools**: Each specialized agent should have unique tools for their domain
- **Custom Processing Logic**: More than just prompt differences
- **Specialized Data Handling**: Agent-specific data structures and processing

For example:
- Google Ads Agent: Tools for keyword research, ad performance analysis
- Copywriting Agent: Tools for content structure, headline generation
- Quiz Agent: Tools for question formatting, answer validation

### 3. Embeddings-Based Routing

Replace the current keyword scoring system with an embeddings-based approach:
- Create embeddings for domain descriptions
- Create embedding for user message
- Use vector similarity to determine best domain match

### 4. Optimized Tool Integration

- Current tools like web search are defined but not effectively used
- Integrate the tools more effectively with agent capabilities
- Consider tool integration at the prompt level for specialized agents

## Implementation Status

- ✅ Core architecture implemented (routing, base agent, specialized agents)
- ✅ UI components developed (agent selector, chat interface)
- ✅ Basic tools implemented (web scraping, URL detection, deep search)
- ⏳ Actual specialized tools for each agent type
- ⏳ True functional differentiation between agents

## Conclusion

The current multi-agent system provides a functional framework with intelligent routing, but is overengineered for what it currently accomplishes. The architecture should either be simplified to focus on prompt specialization, or enhanced to provide true functional differences between agent types with domain-specific tools and processing logic.

Future development should focus on either:
1. Simplifying to a single agent with domain-specific prompts, or
2. Adding substantial agent-specific functionality to justify the complexity