import { BASE_PROMPT } from './base-prompt';
import { COPYWRITING_SYSTEM_PROMPT } from './copywriting-prompts';
import { GOOGLE_ADS_SYSTEM_PROMPT } from './google-ads-prompts';
import { FACEBOOK_ADS_SYSTEM_PROMPT } from './facebook-ads-prompts';
import { QUIZ_SYSTEM_PROMPT } from './quiz-prompts';

export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';

// Map of agent types to their specialized prompts
export const AGENT_PROMPTS: Record<AgentType, string> = {
  'default': '',  // No additional prompt for default agent
  'copywriting': COPYWRITING_SYSTEM_PROMPT,
  'google-ads': GOOGLE_ADS_SYSTEM_PROMPT,
  'facebook-ads': FACEBOOK_ADS_SYSTEM_PROMPT,
  'quiz': QUIZ_SYSTEM_PROMPT
};

/**
 * Builds a complete system prompt for the specified agent type
 * by combining the base prompt and agent-specific prompt
 */
export function buildSystemPrompt(agentType: AgentType): string {
  // Start with the base prompt that applies to all agents
  let prompt = BASE_PROMPT;
  
  // If this is a specialized agent, add its specific prompt
  if (agentType !== 'default') {
    const specializedPrompt = AGENT_PROMPTS[agentType];
    prompt += `\n\n### SPECIALIZED AGENT INSTRUCTIONS (${agentType.toUpperCase()}):\n\n${specializedPrompt}\n\n### END SPECIALIZED INSTRUCTIONS ###\n\nRemember to follow both the base instructions above and these specialized instructions for your role.`;
  }
  
  return prompt;
}

/**
 * Interface for tool results that can be added to the system prompt
 */
export interface ToolResults {
  ragContent?: string;    // Knowledge base results
  webScraper?: string;    // Web scraping results
  deepSearch?: string;    // Deep search results
}

/**
 * Enhances a system prompt with tool results in priority order:
 * 1. Knowledge base (highest)
 * 2. Web scraper (medium)
 * 3. Deep search (lowest)
 */
export function enhancePromptWithToolResults(
  systemPrompt: string,
  toolResults?: ToolResults
): string {
  let enhancedPrompt = systemPrompt;
  
  if (!toolResults) return enhancedPrompt;
  
  // Add knowledge base results (HIGHEST PRIORITY)
  if (toolResults.ragContent) {
    enhancedPrompt += `\n\n### KNOWLEDGE BASE INFORMATION (HIGHEST PRIORITY):\n${toolResults.ragContent}`;
  }
  
  // Add web scraper results (MEDIUM PRIORITY)
  if (toolResults.webScraper) {
    enhancedPrompt += `\n\n### SCRAPED URL CONTENT (MEDIUM PRIORITY):\n${toolResults.webScraper}`;
  }
  
  // Add deep search results (LOWEST PRIORITY)
  if (toolResults.deepSearch) {
    enhancedPrompt += `\n\n### PERPLEXITY RESEARCH INFORMATION (LOWEST PRIORITY):\n${toolResults.deepSearch}`;
  }
  
  return enhancedPrompt;
}

// Re-export everything for convenience
export { BASE_PROMPT } from './base-prompt';
export { COPYWRITING_SYSTEM_PROMPT } from './copywriting-prompts';
export { GOOGLE_ADS_SYSTEM_PROMPT } from './google-ads-prompts';
export { FACEBOOK_ADS_SYSTEM_PROMPT } from './facebook-ads-prompts';
export { QUIZ_SYSTEM_PROMPT } from './quiz-prompts'; 