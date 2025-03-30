import { BASE_PROMPT } from './base-prompt';
import { COPYWRITING_SYSTEM_PROMPT } from './copywriting-prompts';
import { GOOGLE_ADS_SYSTEM_PROMPT } from './google-ads-prompts';
import { FACEBOOK_ADS_SYSTEM_PROMPT } from './facebook-ads-prompts';
import { QUIZ_SYSTEM_PROMPT } from './quiz-prompts';
import { WIDGET_BASE_PROMPT } from './widget-prompt';

// Agent types supported by the system - keep our custom type definitions
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';

// Enhanced prompt types to support both the main chat and widget chat
export type ChatEnginePromptType = AgentType | 'widget';

// Map of agent types to their specialized prompts - maintain our modular organization
export const AGENT_PROMPTS: Record<AgentType, string> = {
  'default': '',  // No additional prompt for default agent
  'copywriting': COPYWRITING_SYSTEM_PROMPT,
  'google-ads': GOOGLE_ADS_SYSTEM_PROMPT,
  'facebook-ads': FACEBOOK_ADS_SYSTEM_PROMPT,
  'quiz': QUIZ_SYSTEM_PROMPT
};

/**
 * Builds a system prompt for the specified agent type
 * following AI SDK standards for system prompts
 */
export function buildSystemPrompt(agentType: AgentType): string {
  // Start with the base prompt that applies to all agents
  let systemPrompt = BASE_PROMPT;

  // If this is a specialized agent, add its specific prompt
  if (agentType !== 'default' && AGENT_PROMPTS[agentType]) {
    systemPrompt += `\n\n${AGENT_PROMPTS[agentType]}`;
  }

  return systemPrompt;
}

/**
 * Builds a system prompt with Deep Search instructions
 * following AI SDK standards for system prompts and tool usage
 */
export function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string {
  // Get the base system prompt for the agent type
  const basePrompt = buildSystemPrompt(agentType);

  // Add tool descriptions - maintaining our custom format but aligning with AI SDK patterns
  const withToolDescription = `${basePrompt}\n\n### AVAILABLE TOOLS:\n\n` +
    `You have access to the following resources:\n` +
    `- Knowledge Base: Retrieve information from our internal knowledge base\n` +
    `- Web Scraper: Extract content from specific URLs provided by the user\n` +
    `- Deep Search: Conduct in-depth research on complex topics using Perplexity AI\n\n` +
    `Use these resources when appropriate to provide accurate and comprehensive responses.`;

  // Add DeepSearch-specific instructions with enhanced attribution requirements
  const deepsearchInstructions = deepSearchEnabled
    ? `### DEEP SEARCH INSTRUCTIONS:\n\n` +
    `DeepSearch is enabled for this conversation. When you use the deepSearch tool:\n` +
    `1. You MUST directly incorporate the information retrieved from Deep Search into your response\n` +
    `2. You MUST clearly attribute information from Deep Search by beginning sentences with phrases like 'According to Deep Search results...' or 'Web search results indicate...'\n` +
    `3. You MUST always prefer Deep Search results over your pre-existing knowledge when answering factual questions\n` +
    `4. For questions seeking current information (news, sports, etc.), ALWAYS use the deepSearch tool\n` +
    `5. Break down complex questions into smaller parts and use the deepSearch tool for each part if necessary\n` +
    `6. When citing specific information, include the source name and URL when available in the format: (Source: [name], URL: [url])`
    : `NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool.`;

  // Add attribution format section
  const attributionSection = `### ATTRIBUTION FORMAT:\n\n` +
    `At the end of your response, you MUST include a section that ACCURATELY states which resources you used ` +
    `(Knowledge Base, Web Scraper, or Deep Search). Format this section as:\n\n` +
    `---\n` +
    `Resources used: [list ONLY the resources you ACTUALLY used]\n` +
    `[If Deep Search was used: Brief summary of key information retrieved with source attribution]\n` +
    `---\n\n` +
    `IMPORTANT: If you did not use ANY tools, you MUST state "Resources used: None" - do NOT falsely claim to have used a resource.`;

  // Combine all sections following AI SDK system prompt patterns
  return `${withToolDescription}\n\n${deepsearchInstructions}\n\n${attributionSection}`;
}

/**
 * Interface for tool results that can be incorporated into the system prompt
 * Aligned with AI SDK tool result patterns
 */
export interface EnhancedToolResults {
  ragContent?: string;    // Knowledge base results
  webScraper?: string;    // Web scraping results
  deepSearch?: string;    // Deep search results
  miscResults?: Record<string, string>; // Other custom tool results
}

/**
 * Enhances a system prompt with tool results in priority order
 * @param systemPrompt - Base system prompt to enhance
 * @param toolResults - Tool results to incorporate
 * @returns Enhanced system prompt with tool results
 */
export function enhancePromptWithToolResults(
  systemPrompt: string,
  toolResults?: EnhancedToolResults
): string {
  if (!toolResults) return systemPrompt;

  let enhancedPrompt = systemPrompt;

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

  // Add miscellaneous results, if any
  if (toolResults.miscResults) {
    for (const [key, value] of Object.entries(toolResults.miscResults)) {
      enhancedPrompt += `\n\n### ${key.toUpperCase()}:\n${value}`;
    }
  }

  return enhancedPrompt;
}

/**
 * Builds a system prompt for any supported prompt type
 * (including widget prompts)
 * @param promptType - Type of prompt to build
 * @returns System prompt string
 */
export function buildChatEnginePrompt(promptType: ChatEnginePromptType): string {
  // Handle agent-based prompt types using the existing infrastructure
  if (promptType === 'default' ||
    promptType === 'copywriting' ||
    promptType === 'google-ads' ||
    promptType === 'facebook-ads' ||
    promptType === 'quiz') {
    return buildSystemPrompt(promptType);
  }

  // Handle widget-specific prompt type
  if (promptType === 'widget') {
    return WIDGET_BASE_PROMPT;
  }

  // Default to the standard agent prompt if type is unrecognized
  return buildSystemPrompt('default');
}

// Convenience object for accessing all prompt-related functionality
// Follows AI SDK patterns for configuration objects
export const prompts = {
  // System prompts for different agents
  mainChat: buildSystemPrompt('default'),
  copywriting: buildSystemPrompt('copywriting'),
  googleAds: buildSystemPrompt('google-ads'),
  facebookAds: buildSystemPrompt('facebook-ads'),
  quiz: buildSystemPrompt('quiz'),
  widget: WIDGET_BASE_PROMPT,

  // Helper functions with standardized interfaces
  withToolResults: enhancePromptWithToolResults,
  buildSystemPrompt: buildSystemPromptWithDeepSearch,

  // Convenience function to get plain system prompt for any agent
  getAgentSystemPrompt: (agentType: AgentType) => buildSystemPrompt(agentType)
};

// Re-export base prompts for use elsewhere
export { BASE_PROMPT } from './base-prompt';
export { COPYWRITING_SYSTEM_PROMPT } from './copywriting-prompts';
export { GOOGLE_ADS_SYSTEM_PROMPT } from './google-ads-prompts';
export { FACEBOOK_ADS_SYSTEM_PROMPT } from './facebook-ads-prompts';
export { QUIZ_SYSTEM_PROMPT } from './quiz-prompts';
export { WIDGET_BASE_PROMPT } from './widget-prompt'; 