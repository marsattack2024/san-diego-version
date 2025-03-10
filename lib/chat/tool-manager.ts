import { edgeLogger } from '@/lib/logger/edge-logger';
import { chatTools } from './tools';
import { ToolResults } from '@/lib/agents/prompts';

/**
 * Tool registry for managing and providing tools to the AI
 */
export class ToolManager {
  private toolResults: ToolResults = {};
  private toolsUsed: string[] = [];
  
  /**
   * Register a tool result
   */
  registerToolResult(toolName: string, content: string): void {
    if (toolName === 'Knowledge Base') {
      this.toolResults.ragContent = content;
    } else if (toolName === 'Web Scraper') {
      this.toolResults.webScraper = content;
    } else if (toolName === 'Deep Search') {
      this.toolResults.deepSearch = content;
    }
    
    if (!this.toolsUsed.includes(toolName)) {
      this.toolsUsed.push(toolName);
    }
    
    edgeLogger.info(`Registered tool result for ${toolName}`, {
      contentLength: content.length
    });
  }
  
  /**
   * Get all registered tool results
   */
  getToolResults(): ToolResults {
    return this.toolResults;
  }
  
  /**
   * Get list of tools that have been used
   */
  getToolsUsed(): string[] {
    return this.toolsUsed;
  }
  
  /**
   * Get tools to provide to the AI
   */
  getToolsToProvide(): Record<string, any> {
    // Return all available tools
    const tools = { ...chatTools };
    
    // Log which tools are being provided
    edgeLogger.info('Providing tools to LLM', { 
      toolNames: Object.keys(tools)
    });
    
    return tools;
  }
  
  /**
   * Clear all tool results and used tools
   */
  clear(): void {
    this.toolResults = {};
    this.toolsUsed = [];
  }
}

// Export a singleton instance
export const toolManager = new ToolManager(); 