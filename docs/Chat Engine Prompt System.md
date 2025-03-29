# Chat Engine Prompt System

## Overview

The Chat Engine Prompt System is a self-contained module that manages all prompt definitions used by the chat engine. It provides a centralized approach to handle system prompts for different agent types and chat experiences without relying on external dependencies.

The system is designed to:
- Maintain all prompt templates in separate files for easy maintenance
- Support different agent types with specialized prompt instructions
- Enable prompt composition with base and specialized components
- Facilitate enhancement of prompts with tool results
- Provide a clean, self-contained interface for the chat engine

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
  webScraper: "Content scraped from user-provided URL..."
});
```

## Modular File Structure Benefits

The modular file structure provides several advantages:

1. **Maintainability**: Each prompt can be edited independently without affecting others
2. **Clarity**: Specific prompt files are easy to locate and modify
3. **Collaboration**: Team members can work on different prompts simultaneously
4. **Version Control**: Changes to individual prompts are more clearly visible in commits
5. **Organization**: Prompts are grouped by functionality and purpose

## Migration from Old Prompt System

Previously, the chat engine relied on the old `AgentRouter` class from `lib/agents/agent-router.ts` to retrieve system prompts. This created an unnecessary dependency that complicated the refactoring process.

The current implementation removes this dependency by:

1. Moving all prompt definitions into separate files within the `lib/chat-engine/prompts/` directory
2. Implementing the prompt building logic within the index.ts file
3. Using a consistent format for all prompt types
4. Maintaining full compatibility with the existing prompt structure

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
  webScraper: "Content from user's website..."
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
  { ragContent: "Relevant Google Ads information..." }
);
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

## Future Enhancements

- Supporting per-user prompt customization
- Adding A/B testing capabilities for prompt variants
- Implementing prompt versioning
- Adding runtime prompt optimization based on performance metrics
- Supporting dynamic prompt selection based on user behavior 