# Agent Selector Implementation Guide

This document provides detailed technical documentation about how the Agent Selector works in our application, including the files involved and how agent selection is calculated.

## Overview

The Agent Selector allows users to choose between different specialized AI agents for different tasks. The system automatically routes messages to appropriate specialized agents based on content analysis, but users can also explicitly select an agent of their choice.

## Key Files and Their Roles

### 1. Agent Router Implementation

**File: `/lib/agents/agent-router.ts`**

This is the core file that handles agent routing logic. It contains:

- The `AgentRouter` class which has two primary methods:
  - `routeMessage(selectedAgentId, messages)`: Determines which agent should handle a message
  - `getSystemPrompt(agentType, deepSearchEnabled)`: Builds the system prompt for a selected agent

The routing algorithm works as follows:
```typescript
routeMessage(selectedAgentId: AgentType, messages: Message[]): AgentType {
  // If user has explicitly selected a non-default agent, use that
  if (selectedAgentId !== 'default') {
    return selectedAgentId;
  }

  // Auto-routing only happens from the default agent
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return 'default';
  }

  const content = lastMessage.content.toLowerCase();
  
  // Calculate scores for each agent type based on keywords
  const scores: Record<AgentType, number> = {...};
  
  for (const [agentType, keywords] of Object.entries(AGENT_KEYWORDS)) {
    if (agentType === 'default') continue;
    
    for (const keyword of keywords) {
      // Multi-word keywords get higher scores (2 points per word)
      if (content.includes(keyword.toLowerCase())) {
        const wordCount = keyword.split(' ').length;
        const score = wordCount * 2;
        scores[agentType as AgentType] += score;
        
        // Bonus points for keywords at the beginning (5 points)
        if (content.startsWith(keyword.toLowerCase())) {
          scores[agentType as AgentType] += 5;
        }
        
        // Bonus for exact phrase matches (3 points)
        if (new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i').test(content)) {
          scores[agentType as AgentType] += 3;
        }
      }
    }
  }

  // Find agent with highest score
  let highestScore = 0;
  let selectedAgent: AgentType = 'default';
  
  for (const [agentType, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      selectedAgent = agentType as AgentType;
    }
  }

  // Only route to specialized agent if score exceeds threshold (5)
  const routingThreshold = 5;
  if (highestScore >= routingThreshold) {
    return selectedAgent;
  }
  
  return 'default';
}
```

### 2. Agent Keywords Configuration

**File: `/lib/agents/agent-router.ts`**

The keywords that trigger specific agents are defined at the top of the same file:

```typescript
const AGENT_KEYWORDS: Record<AgentType, string[]> = {
  'default': [],
  'copywriting': [
    'copywriting', 'copy', 'website text', 'landing page', 'sales page', 
    'email copy', 'marketing copy', 'write copy', 'content writing',
    /* more keywords... */
  ],
  'google-ads': [
    'google ads', 'google ad', 'google advertising', 'search ads', 'ppc',
    /* more keywords... */
  ],
  'facebook-ads': [
    'facebook ad', 'facebook ads', 'social ad', 'instagram ad', 'meta ad',
    /* more keywords... */
  ],
  'quiz': [
    'quiz', 'question', 'test', 'assessment', 'questionnaire',
    /* more keywords... */
  ]
};
```

### 3. Agent Type Definition

**File: `/lib/agents/core/agent-types.ts`**

This file defines the `AgentType` type used throughout the application:

```typescript
export type AgentType = 'default' | 'google-ads' | 'facebook-ads' | 'copywriting' | 'quiz';
```

### 4. Agent Prompt Building

**File: `/lib/agents/prompts/index.ts`**

This file exports the specialized prompts and a function to build the full system prompt:

```typescript
export function buildSystemPrompt(agentType: AgentType): string {
  // Determine which prompt to use based on agent type
  const specializedPrompt = AGENT_PROMPTS[agentType];
  
  // Combine base prompt with specialized prompt
  return `${BASE_PROMPT}\n\n${specializedPrompt}`;
}
```

### 5. Agent UI Component

**File: `/components/agent-selector.tsx`**

This is the React component that renders the agent selection dropdown in the UI:

```tsx
export function AgentSelector({
  className,
}: React.ComponentProps<typeof Button>) {
  const selectedAgentId = useChatStore(state => state.selectedAgentId);
  const setSelectedAgent = useChatStore(state => state.setSelectedAgent);

  const selectedAgent = useMemo(
    () => agents.find(agent => agent.id === selectedAgentId) || agents[0],
    [selectedAgentId],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="...">
        <Button variant="outline" className="...">
          {selectedAgent?.name}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="...">
        {agents.map((agent) => {
          const { id } = agent;
          const isSelected = id === selectedAgentId;

          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => {
                setSelectedAgent(id as AgentType);
              }}
              className="..."
              data-active={isSelected}
            >
              <div className="...">{agent.name}</div>
              {isSelected && <CheckCircleFillIcon />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 6. Agent List Configuration 

**File: `/lib/ai/agents.ts`**

This file defines the list of available agents shown in the dropdown:

```typescript
export const agents = [
  {
    id: 'default',
    name: 'General Assistant',
    description: 'A versatile assistant that can help with a wide range of tasks',
    icon: 'bot',
  },
  {
    id: 'copywriting',
    name: 'Copywriting Specialist',
    description: 'Expert in creating compelling marketing copy and content',
    icon: 'pencil',
  },
  {
    id: 'google-ads',
    name: 'Google Ads Specialist',
    description: 'Expert in Google Ads campaign creation and optimization',
    icon: 'google',
  },
  {
    id: 'facebook-ads',
    name: 'Facebook Ads Specialist',
    description: 'Expert in Facebook and Instagram advertising strategies',
    icon: 'facebook',
  },
  {
    id: 'quiz',
    name: 'Quiz Specialist',
    description: 'Expert in creating and managing interactive quizzes',
    icon: 'question-mark',
  },
];
```

### 7. Chat Store for Agent State

**File: `/stores/chat-store.ts`**

This file manages the state for agent selection using Zustand:

```typescript
export const useChatStore = create<ChatStore>((set) => ({
  selectedAgentId: 'default',
  setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),
  // ... other store properties and methods
}));
```

## Agent Selection Process Flowchart

```
┌─────────────────────┐
│  User Selects Agent │
│  from Dropdown      │◄────────── User Initiated
└──────────┬──────────┘            Selection
           │
           ▼
┌─────────────────────┐
│ Is selected agent   │      ┌─────────────────┐
│ 'default'?          ├──Yes─►  Continue to    │
└──────────┬──────────┘      │  Auto-Routing   │
           │                 └─────────────────┘
           │ No
           ▼
┌─────────────────────┐
│ Use selected agent  │
│ (Skip auto-routing) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Build system prompt │
│ for selected agent  │
└─────────────────────┘
```

## Auto-Routing Process Flowchart

```
┌─────────────────────┐
│  New User Message   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Extract message     │
│ content             │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check for keywords  │
│ for each agent type │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│ Calculate scores:   │     │ Score Calculation:  │
│ - Base word match   │     │ - Multi-word: x2    │
│ - Position bonus    ├────►│ - Start position: +5│
│ - Exact match bonus │     │ - Exact match: +3   │
└──────────┬──────────┘     └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Is highest score    │     ┌─────────────────────┐
│ above threshold (5)?├─No──► Use Default Agent   │
└──────────┬──────────┘     └─────────────────────┘
           │ Yes
           ▼
┌─────────────────────┐
│ Use Specialized     │
│ Agent with highest  │
│ score               │
└─────────────────────┘
```

## Technical Details

### Scoring Algorithm

The agent selection algorithm uses a weighted scoring system:

1. **Base Score**: 2 points for each word in a matching keyword
   - Example: "google ads" (2 words) = 4 points
   - Example: "facebook advertising" (2 words) = 4 points

2. **Position Bonus**: +5 points if keyword is at the start of message
   - Example: "copywriting for my website" = +5 for copywriting agent
   - Example: "I need copywriting for my website" = No bonus (not at start)

3. **Exact Match Bonus**: +3 points if keyword is an exact word match
   - Example: "Create a quiz for my students" = +3 for quiz agent
   - Example: "I need quizzes for testing" = +3 for quiz agent

### Threshold Logic

- The default threshold is 5 points
- This means a single-word keyword needs bonuses to trigger a specialized agent
- Multi-word keywords can trigger specialized agents on their own
- This prevents false-positive agent switching on common words

### Prompt Combination

When an agent is selected (automatically or manually), the system:

1. Gets the base prompt common to all agents
2. Gets the specialized prompt for the selected agent
3. Combines them into a single system prompt
4. Adds tool descriptions and instructions
5. Uses this as the context for the AI model

## How to Modify Agent Selection

### Adding New Keywords

To add new keywords for an agent, update the `AGENT_KEYWORDS` object in `lib/agents/agent-router.ts`:

```typescript
const AGENT_KEYWORDS: Record<AgentType, string[]> = {
  'copywriting': [
    // Existing keywords...
    'new keyword 1', 
    'new keyword 2',
  ],
  // Other agents...
};
```

### Changing the Threshold

To make agent switching more or less sensitive, modify the `routingThreshold` value in the `routeMessage` method:

```typescript
// Only route to a specialized agent if the score is above a threshold
const routingThreshold = 5; // Change this value (higher = less sensitive)
```

### Adding a New Agent Type

To add a new agent type:

1. Update the `AgentType` type in `lib/agents/core/agent-types.ts`
2. Add the agent's keywords in `lib/agents/agent-router.ts`
3. Create a system prompt in `lib/agents/prompts/`
4. Add the agent to the `agents` array in `lib/ai/agents.ts`
5. Create a specialized agent class in `lib/agents/specialized/`

## Debugging Agent Selection

To debug which agent is being selected and why:

1. Enable logging in the `routeMessage` method
2. The method already has debug logs that show:
   - Scores for each agent type
   - The selected agent
   - The threshold comparison
   - The final agent selection decision

For example:
```typescript
edgeLogger.debug('Agent routing scores', { scores });
edgeLogger.info('Auto-routed to specialized agent', { 
  selectedAgent, 
  score: highestScore, 
  threshold: routingThreshold 
});
```

## Conclusion

The agent selection system provides a flexible way to route user queries to specialized AI agents. The combination of explicit user selection and automatic content-based routing ensures that the most appropriate agent handles each query. The scoring algorithm balances specificity and sensitivity to avoid incorrect agent selection while still effectively identifying domain-specific requests.