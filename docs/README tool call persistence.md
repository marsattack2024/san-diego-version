# Tool Call Persistence

## Overview

This document describes the implementation of tool call persistence in the San Diego project. The feature captures tool usage information from AI-generated responses and stores it in the database for later analysis and auditing.

## Implementation

The tool call persistence feature captures two types of information:

1. **Text-based tool references** - When the AI mentions tools in its response text (e.g., "I used the knowledge base to find information about...")
2. **API-based tool calls** - The actual tool calls made by the AI via the Vercel AI SDK function calling feature

### Data Structure

Tool usage data is stored in the `tools_used` JSONB column of the `sd_chat_histories` table with the following structure:

```typescript
interface ToolsUsedData {
    // From text extraction (existing functionality)
    tools?: string[];
    
    // From AI SDK tool calls (new functionality)
    api_tool_calls?: Array<{
        name?: string;  // The name of the tool called
        id: string;     // The unique ID of the tool call
        type: string;   // The type of tool call (e.g., "function")
    }>;
    
    // Additional metadata
    [key: string]: any;
}
```

### Implementation Details

1. **Tool Call Extraction:**
   - The `onFinish` callback in the `streamText` function extracts tool usage information from the AI response.
   - It checks for both text-based tool references and API-based tool calls.
   - The extracted data is merged into a single `toolsUsed` object.

2. **Data Persistence:**
   - The extracted tool usage data is passed to the `saveAssistantMessage` method.
   - The `MessagePersistenceService` saves this data to the `tools_used` column in the database.

3. **Error Handling:**
   - The implementation includes proper error handling and fallbacks if the response format changes.
   - Optional chaining is used to safely access properties that might be undefined.

## Example Usage

A typical assistant message saved to the database might include:

```json
{
  "content": "I've found information about TypeScript using the knowledge base...",
  "role": "assistant",
  "tools_used": {
    "tools": ["I used the knowledge base tool to search for TypeScript documentation"],
    "api_tool_calls": [
      {
        "id": "call_abc123",
        "type": "function",
        "name": "searchKnowledgeBase"
      },
      {
        "id": "call_def456",
        "type": "function",
        "name": "scrapeWebContent"
      }
    ]
  }
}
```

## Validation and Testing

The implementation includes unit tests in `tests/unit/chat-engine/tools-used-persistence.test.ts` that verify:

1. Proper extraction of tool calls from the AI SDK response
2. Correct saving of tool usage data to the database
3. Proper handling of responses without tool calls

## Benefits

This implementation provides several benefits:

1. **Analytics:** Track which tools are most frequently used by the AI
2. **Debugging:** Identify when and why specific tools are called
3. **Transparency:** Show users which tools were used to generate a response
4. **Performance Monitoring:** Measure tool usage patterns and optimize accordingly

## Next Steps

1. **Frontend Visualization:** Add UI components to display tool usage in the chat interface
2. **Analytics Dashboard:** Create a dashboard to visualize tool usage patterns
3. **Rate Limiting:** Implement tool-specific rate limiting based on usage data
4. **Tool Optimization:** Use the collected data to optimize tool implementations 