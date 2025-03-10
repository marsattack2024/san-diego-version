import { edgeLogger } from '@/lib/logger/edge-logger';
import { ToolResults, enhancePromptWithToolResults } from '@/lib/agents/prompts';

/**
 * Configuration for content truncation
 */
export interface TruncationConfig {
  ragMaxLength?: number;
  deepSearchMaxLength?: number;
  webScraperMaxLength?: number;
}

/**
 * Default truncation limits
 */
const DEFAULT_TRUNCATION_LIMITS: TruncationConfig = {
  ragMaxLength: 10000,
  deepSearchMaxLength: 5000,
  webScraperMaxLength: 8000
};

/**
 * Truncates content to a specified length with a message
 */
export function truncateContent(content: string, maxLength: number, label: string): string {
  if (!content) return '';
  
  if (content.length > maxLength) {
    const truncated = content.substring(0, maxLength);
    edgeLogger.info(`Truncated ${label} content`, {
      originalLength: content.length,
      truncatedLength: maxLength
    });
    return truncated + `\n\n[${label} truncated for brevity. Total length: ${content.length} characters]`;
  }
  
  return content;
}

/**
 * Optimizes tool results by truncating long content
 */
export function optimizeToolResults(
  toolResults: ToolResults,
  config: TruncationConfig = DEFAULT_TRUNCATION_LIMITS
): ToolResults {
  const { ragMaxLength, deepSearchMaxLength, webScraperMaxLength } = {
    ...DEFAULT_TRUNCATION_LIMITS,
    ...config
  };
  
  const optimizedResults: ToolResults = {};
  
  // Truncate RAG content if available
  if (toolResults.ragContent) {
    optimizedResults.ragContent = truncateContent(
      toolResults.ragContent,
      ragMaxLength!,
      'Knowledge Base'
    );
  }
  
  // Truncate Deep Search content if available
  if (toolResults.deepSearch) {
    optimizedResults.deepSearch = truncateContent(
      toolResults.deepSearch,
      deepSearchMaxLength!,
      'Deep Search'
    );
  }
  
  // Truncate Web Scraper content if available
  if (toolResults.webScraper) {
    optimizedResults.webScraper = truncateContent(
      toolResults.webScraper,
      webScraperMaxLength!,
      'Web Scraper'
    );
  }
  
  return optimizedResults;
}

/**
 * Builds a system prompt with tool results and reporting instructions
 */
export function buildEnhancedSystemPrompt(
  basePrompt: string,
  toolResults: ToolResults,
  toolsUsed: string[]
): string {
  // Optimize tool results to reduce token usage
  const optimizedResults = optimizeToolResults(toolResults);
  
  // Add a summary of tools used at the beginning
  let enhancedPrompt = `RESOURCES USED IN THIS RESPONSE:\n${toolsUsed.map(tool => {
    if (tool === 'Knowledge Base' && optimizedResults.ragContent) {
      return `- Knowledge Base: ${optimizedResults.ragContent.length} characters`;
    }
    if (tool === 'Web Scraper' && optimizedResults.webScraper) {
      return `- Web Scraper: ${optimizedResults.webScraper.length} characters`;
    }
    if (tool === 'Deep Search' && optimizedResults.deepSearch) {
      return `- Deep Search: ${optimizedResults.deepSearch.length} characters`;
    }
    return `- ${tool}: No content`;
  }).join('\n')}\n\n`;
  
  // Add the base prompt
  enhancedPrompt += basePrompt;
  
  // Enhance with tool results
  enhancedPrompt = enhancePromptWithToolResults(enhancedPrompt, optimizedResults);
  
  // Add detailed instructions for reporting tools used
  enhancedPrompt += `\n\nIMPORTANT: At the end of your response, you MUST include a section titled "--- Tools and Resources Used ---" that lists all the resources used to generate your response. Format it exactly like this:

--- Tools and Resources Used ---
${toolsUsed.map(tool => {
  if (tool === 'Knowledge Base' && optimizedResults.ragContent) {
    return `- Knowledge Base: Retrieved ${optimizedResults.ragContent.length} characters of relevant information`;
  }
  if (tool === 'Web Scraper' && optimizedResults.webScraper) {
    return `- Web Scraper: Analyzed content with ${optimizedResults.webScraper.length} characters`;
  }
  if (tool === 'Deep Search' && optimizedResults.deepSearch) {
    return `- Deep Search: Retrieved ${optimizedResults.deepSearch.length} characters of additional context through web search`;
  }
  return `- ${tool}: No content retrieved`;
}).join('\n')}

This section is REQUIRED and must be included at the end of EVERY response.`;
  
  edgeLogger.info('Built enhanced system prompt', {
    promptLength: enhancedPrompt.length,
    toolsUsed
  });
  
  return enhancedPrompt;
} 