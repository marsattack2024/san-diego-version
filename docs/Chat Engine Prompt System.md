# Chat Engine Prompt System

## Overview

The Chat Engine Prompt System is a self-contained module that manages all prompt definitions used by the chat engine. It provides a centralized approach to handle system prompts for different agent types and chat experiences without relying on external dependencies.

The system is designed to:
- Maintain all prompt templates in separate files for easy maintenance
- Support different agent types with specialized prompt instructions
- Enable prompt composition with base and specialized components
- Facilitate enhancement of prompts with tool results
- Provide a clean, self-contained interface for the chat engine
- Support DeepSearch feature integration via prompt flags

## Architecture

The prompt system is implemented with a modular file structure that keeps each prompt type in its own file:

```
lib/
  chat-engine/
    prompts/
      index.ts              # Central export hub with builder functions
      base-prompt.ts        # Base prompt shared by all agents
      copywriting-prompts.ts # Copywriting agent specialized prompt
      google-ads-prompts.ts  # Google Ads agent specialized prompt
      facebook-ads-prompts.ts # Facebook Ads agent specialized prompt
      quiz-prompts.ts        # Quiz agent specialized prompt
      widget-prompt.ts       # Standard widget prompt
    agent-router.ts        # Uses prompts for agent configuration
    core.ts                # Uses prompts for system prompt setup
```

### Key Components

1. **Agent Types**: Defines the different specialized agents supported by the system
2. **Prompt Files**: Each prompt is maintained in its own file for better organization
3. **Central Index**: The index.ts file re-exports all prompts and provides builder functions
4. **Prompt Builder**: Functions to compose complete prompts from base and specialized components
5. **Tool Result Enhancer**: Logic to enhance prompts with context from tools
6. **Convenience Exports**: Provides easy access to common prompt combinations
7. **DeepSearch Integration**: Support for DeepSearch feature flags in prompts

## Supported Agent Types

The system supports the following agent types:

```typescript
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';
```

Additionally, it supports the widget-specific prompt type:

```typescript
export type ChatEnginePromptType = AgentType | 'widget';
```

## Core Functions

### `buildSystemPrompt`

Builds a complete system prompt for a specified agent type by combining:
- The base prompt shared by all agents
- Any specialized instructions specific to the agent type

```typescript
function buildSystemPrompt(agentType: AgentType): string
```

Example usage:
```typescript
const copywritingPrompt = buildSystemPrompt('copywriting');
```

### `buildSystemPromptWithDeepSearch`

Enhanced version of `buildSystemPrompt` that adds DeepSearch-specific instructions:

```typescript
function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string
```

This function:
1. Gets the base system prompt for the agent type
2. Adds common tool descriptions
3. Adds DeepSearch-specific instructions based on the enabled flag
4. Adds instruction to mention tools used

Example usage:
```typescript
// For a prompt with DeepSearch enabled
const promptWithDeepSearch = buildSystemPromptWithDeepSearch('copywriting', true);

// For a prompt with DeepSearch disabled
const promptWithoutDeepSearch = buildSystemPromptWithDeepSearch('default', false);
```

### `buildChatEnginePrompt`

Extends `buildSystemPrompt` to handle all possible chat engine prompt types, including the widget-specific format:

```typescript
function buildChatEnginePrompt(promptType: ChatEnginePromptType): string
```

Example usage:
```typescript
const widgetPrompt = buildChatEnginePrompt('widget');
```

### `enhancePromptWithToolResults`

Enhances a system prompt with context retrieved from various tools, organizing them by priority:

```typescript
function enhancePromptWithToolResults(
  systemPrompt: string, 
  toolResults?: ToolResults
): string
```

Example usage:
```typescript
const enhancedPrompt = enhancePromptWithToolResults(basePrompt, {
  ragContent: "Relevant knowledge base information...",
  webScraper: "Content scraped from user-provided URL...",
  deepSearch: "Information retrieved from web search..."
});
```

## DeepSearch Integration

The prompt system supports DeepSearch feature integration with specialized handling:

### Flag-based Control

```typescript
// Add DeepSearch-specific instructions
const withDeepSearchInstructions = withToolDescription + "\n\n" + (
  deepSearchEnabled
    ? "IMPORTANT: DeepSearch is enabled for this conversation. Use the deepSearch tool for research-intensive questions."
    : "NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool."
);
```

### Contextual Enhancement

When DeepSearch results are available, they are added to the prompt with proper formatting:

```typescript
// Add deep search results to the prompt
if (toolResults.deepSearch) {
  enhancedPrompt += `\n\n### DEEP SEARCH RESULTS ###\nThe following information was retrieved through deep web research:\n\n${toolResults.deepSearch}\n\n`;
  toolsUsed.push('Deep Search');
}
```

## Modular File Structure Benefits

The modular file structure provides several advantages:

1. **Maintainability**: Each prompt can be edited independently without affecting others
2. **Clarity**: Specific prompt files are easy to locate and modify
3. **Collaboration**: Team members can work on different prompts simultaneously
4. **Version Control**: Changes to individual prompts are more clearly visible in commits
5. **Organization**: Prompts are grouped by functionality and purpose
6. **Feature Isolation**: Features like DeepSearch can be toggled without modifying prompt files

## Migration from Old Prompt System

Previously, the chat engine relied on the old `AgentRouter` class from `lib/agents/agent-router.ts` to retrieve system prompts. This created an unnecessary dependency that complicated the refactoring process.

The current implementation removes this dependency by:

1. Moving all prompt definitions into separate files within the `lib/chat-engine/prompts/` directory
2. Implementing the prompt building logic within the index.ts file
3. Using a consistent format for all prompt types
4. Maintaining full compatibility with the existing prompt structure
5. Adding support for conditional features like DeepSearch

This change makes the chat engine fully self-contained and simplifies future maintenance by:
- Reducing dependencies between old and new code
- Centralizing all prompt-related logic in one module
- Making prompt changes easier to track and manage
- Supporting a cleaner separation between components

## Usage Examples

### Basic Agent Prompt

```typescript
import { buildSystemPrompt } from '@/lib/chat-engine/prompts';

// Get a complete system prompt for the copywriting agent
const systemPrompt = buildSystemPrompt('copywriting');
```

### Prompt with DeepSearch Flag

```typescript
import { prompts } from '@/lib/chat-engine/prompts';

// Create a prompt with DeepSearch enabled
const deepSearchEnabledPrompt = prompts.buildSystemPrompt('copywriting', true);

// Create a prompt with DeepSearch disabled
const deepSearchDisabledPrompt = prompts.buildSystemPrompt('google-ads', false);
```

### Widget Chat Prompt

```typescript
import { buildChatEnginePrompt } from '@/lib/chat-engine/prompts';

// Get the standard widget prompt
const widgetPrompt = buildChatEnginePrompt('widget');
```

### Enhanced Prompt with Tool Results

```typescript
import { buildSystemPrompt, enhancePromptWithToolResults } from '@/lib/chat-engine/prompts';

// Get base prompt
const basePrompt = buildSystemPrompt('default');

// Enhance with tool results
const enhancedPrompt = enhancePromptWithToolResults(basePrompt, {
  ragContent: "Retrieved knowledge base content...",
  webScraper: "Content from user's website...",
  deepSearch: "Information from web search..."
});
```

### Using Convenience Exports

```typescript
import { prompts } from '@/lib/chat-engine/prompts';

// Quick access to common prompts
const defaultPrompt = prompts.mainChat;
const copywritingPrompt = prompts.copywriting;
const widgetPrompt = prompts.widget;

// Using the tool results enhancer
const enhancedPrompt = prompts.withToolResults(
  prompts.googleAds,
  { 
    ragContent: "Relevant Google Ads information...",
    deepSearch: "Latest web information on Google Ads..."
  }
);
```

## Integration with Chat Engine Core

The prompt system integrates with the chat engine core in the following way:

```typescript
// In the chat API route
const { agentType, config: agentConfig } = await detectAgentType(
  lastUserMessage.content as string,
  requestedAgentId as any
);

// Determine if Deep Search should be enabled
const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;
const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

// Create the chat engine with the detected agent configuration
const engine = createChatEngine({
  // ...other config
  systemPrompt: prompts.buildSystemPrompt(agentType, shouldUseDeepSearch),
  // ...more config
});
```

## Adding New Prompt Types

To add a new agent or prompt type:

1. Create a new file in the `lib/chat-engine/prompts/` directory (e.g., `new-agent-prompt.ts`)
2. Export the prompt constant from that file
3. Update the `AgentType` or `ChatEnginePromptType` type in `index.ts`
4. Import the new prompt in `index.ts`
5. Add the prompt to the `AGENT_PROMPTS` record or handle it in `buildChatEnginePrompt`
6. Add a convenience export to the `prompts` object

## Benefits

This self-contained prompt system provides several advantages:

1. **Independence**: The chat engine no longer depends on old code
2. **Centralization**: All prompt logic lives in one place, with separate files for content
3. **Consistency**: All prompts follow the same structure and patterns
4. **Flexibility**: Easy to add new agent types or modify existing ones
5. **Maintainability**: Changes to prompts don't require modifying multiple files
6. **Clarity**: Clear separation between prompt definition and usage
7. **Feature Control**: Easy toggling of features like DeepSearch through prompt flags

## Future Enhancements

- Supporting per-user prompt customization
- Adding A/B testing capabilities for prompt variants
- Implementing prompt versioning
- Adding runtime prompt optimization based on performance metrics
- Supporting dynamic prompt selection based on user behavior
- Enhanced tool result formatting with better structure and prioritization
- Multilingual prompt support with automatic translation 