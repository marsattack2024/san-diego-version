import { edgeLogger } from '@/lib/logger/edge-logger';
import { chatTools } from './tools';
import { ToolResults } from '@/lib/agents/prompts';

/**
 * Manages tool results and state during a chat processing session
 */
export class ToolManager {
  private toolResults: Record<string, string> = {};
  private toolsUsed: Set<string> = new Set();
  private toolCallIds: Record<string, boolean> = {};

  /**
   * Create a new ToolManager instance
   */
  constructor() {
    // Initialize silently - no logging needed
  }

  /**
   * Register a tool being used by ID
   */
  registerToolUsage(toolName: string): void {
    this.toolsUsed.add(toolName);
    edgeLogger.debug(`Tool registered: ${toolName}`, {
      operation: 'tool_register',
      toolName,
      toolsUsed: this.toolsUsed.size
    });
  }

  /**
   * Register a result from a tool
   */
  registerToolResult(toolName: string, content: string | { content: string }, options?: { fromExplicitToolCall?: boolean }): void {
    // Handle both string and object with content property
    const finalContent = typeof content === 'object' && content.content ? content.content : content;

    if (typeof finalContent === 'string' && finalContent.trim()) {
      this.toolResults[toolName] = finalContent;

      // Only add to toolsUsed if it's from an explicit tool call or specified in options
      const isExplicitToolCall = options?.fromExplicitToolCall !== false;

      if (isExplicitToolCall) {
        this.toolsUsed.add(toolName);
        edgeLogger.debug(`Tool registered with result: ${toolName}`, {
          operation: 'tool_result_register',
          toolName,
          contentLength: finalContent.length,
          fromExplicit: isExplicitToolCall
        });
      } else {
        edgeLogger.debug(`Tool result stored but not marked as used: ${toolName}`, {
          operation: 'tool_result_store_only',
          toolName,
          contentLength: finalContent.length
        });
      }
    }
  }

  /**
   * Check if a specific tool has been used
   */
  hasToolBeenUsed(toolName: string): boolean {
    return this.toolsUsed.has(toolName);
  }

  /**
   * Get all tools that have been used
   */
  getToolsUsed(): string[] {
    return Array.from(this.toolsUsed);
  }

  /**
   * Get the results from all tools
   */
  getToolResults(): ToolResults {
    return {
      ragContent: this.toolResults['Knowledge Base'],
      webScraper: this.toolResults['Web Scraper'],
      deepSearch: this.toolResults['Deep Search']
    };
  }

  /**
   * Get a specific tool result by name
   */
  getToolResult(toolName: string): string | null {
    return this.toolResults[toolName] || null;
  }

  /**
   * Register a tool call ID as processed
   */
  registerToolCallId(toolCallId: string): void {
    this.toolCallIds[toolCallId] = true;
  }

  /**
   * Check if a tool call ID has been processed
   */
  hasToolCallIdBeenProcessed(toolCallId: string): boolean {
    return !!this.toolCallIds[toolCallId];
  }

  /**
   * Summarize the current tools and their results
   */
  summarizeTools(): string {
    const summary = Array.from(this.toolsUsed).map(toolName => {
      const result = this.getToolResult(toolName);
      return `${toolName}: ${result ? `${result.length} chars` : 'No content'}`;
    }).join(', ');

    return `Tools used: [${summary}]`;
  }
}

// Export a singleton instance
export const toolManager = new ToolManager(); 