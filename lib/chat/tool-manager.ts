import { edgeLogger } from '@/lib/logger/edge-logger';
import { chatTools } from './tools';
import { ToolResults } from '@/lib/agents/prompts';

/**
 * Manages tool results and state during a chat processing session
 */
export class ToolManager {
  private toolResults: ToolResults = {};
  private toolsUsed: string[] = [];
  private toolCallIds: Record<string, boolean> = {};
  
  /**
   * Create a new ToolManager instance
   */
  constructor() {
    edgeLogger.debug('Tool manager initialized', {
      operation: 'tool_manager_init'
    });
  }
  
  /**
   * Register a tool being used by ID
   */
  registerToolUsage(toolName: string): void {
    if (!this.toolsUsed.includes(toolName)) {
      this.toolsUsed.push(toolName);
      edgeLogger.debug(`Tool registered: ${toolName}`, {
        operation: 'tool_register',
        toolName,
        toolsUsed: this.toolsUsed.length
      });
    }
  }
  
  /**
   * Register a result from a tool
   */
  registerToolResult(toolName: string, content: string): void {
    // Skip if content is empty
    if (!content || content.trim() === '') {
      edgeLogger.debug(`Empty content for tool ${toolName}, skipping registration`, {
        operation: 'tool_result_empty',
        toolName
      });
      return;
    }
    
    edgeLogger.info(`Registering result for tool: ${toolName}`, {
      operation: 'tool_result_register',
      toolName,
      contentLength: content.length,
      contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
    });
    
    // Record the tool as used
    this.registerToolUsage(toolName);
    
    // Register the result based on the tool type
    switch (toolName) {
      case 'Knowledge Base':
        this.toolResults.ragContent = content;
        break;
      case 'Web Scraper':
        this.toolResults.webScraper = content;
        break;
      case 'Deep Search':
        this.toolResults.deepSearch = content;
        break;
      default:
        // For generic tools, store in miscResults
        if (!this.toolResults.miscResults) {
          this.toolResults.miscResults = {};
        }
        this.toolResults.miscResults[toolName] = content;
    }
  }
  
  /**
   * Check if a specific tool has been used
   */
  hasToolBeenUsed(toolName: string): boolean {
    return this.toolsUsed.includes(toolName);
  }
  
  /**
   * Get all tools that have been used
   */
  getToolsUsed(): string[] {
    return [...this.toolsUsed];
  }
  
  /**
   * Get the results from all tools
   */
  getToolResults(): ToolResults {
    return { ...this.toolResults };
  }
  
  /**
   * Get a specific tool result by name
   */
  getToolResult(toolName: string): string | null {
    switch (toolName) {
      case 'Knowledge Base':
        return this.toolResults.ragContent || null;
      case 'Web Scraper':
        return this.toolResults.webScraper || null;
      case 'Deep Search':
        return this.toolResults.deepSearch || null;
      default:
        // For generic tools, check miscResults
        return this.toolResults.miscResults?.[toolName] || null;
    }
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
    const summary = this.toolsUsed.map(toolName => {
      const result = this.getToolResult(toolName);
      return `${toolName}: ${result ? `${result.length} chars` : 'No content'}`;
    }).join(', ');
    
    return `Tools used: [${summary}]`;
  }
}

// Export a singleton instance
export const toolManager = new ToolManager(); 