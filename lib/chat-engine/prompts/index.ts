import { BASE_PROMPT } from './base-prompt';
import { COPYWRITING_SYSTEM_PROMPT } from './copywriting-prompts';
import { GOOGLE_ADS_SYSTEM_PROMPT } from './google-ads-prompts';
import { FACEBOOK_ADS_SYSTEM_PROMPT } from './facebook-ads-prompts';
import { QUIZ_SYSTEM_PROMPT } from './quiz-prompts';
import { WIDGET_BASE_PROMPT } from './widget-prompt';

// Agent types supported by the system
export type AgentType = 'default' | 'copywriting' | 'google-ads' | 'facebook-ads' | 'quiz';

// Enhanced prompt types to support both the main chat and widget chat
export type ChatEnginePromptType = AgentType | 'widget';

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
 * Builds a complete system prompt for the specified agent type
 * with optional DeepSearch instructions
 */
export function buildSystemPromptWithDeepSearch(agentType: AgentType, deepSearchEnabled = false): string {
  // Get the base system prompt for the agent type
  const basePrompt = buildSystemPrompt(agentType);

  // Add common tool description
  const withToolDescription = basePrompt + "\n\n### AVAILABLE TOOLS:\n\nYou have access to the following resources:\n- Knowledge Base: Retrieve information from our internal knowledge base\n- Web Scraper: Extract content from specific URLs provided by the user\n- Deep Search: Conduct in-depth research on complex topics using Perplexity AI\n\nUse these resources when appropriate to provide accurate and comprehensive responses.";

  // Add DeepSearch-specific instructions
  const withDeepSearchInstructions = withToolDescription + "\n\n" + (
    deepSearchEnabled
      ? "IMPORTANT: DeepSearch is enabled for this conversation. Use the deepSearch tool for research-intensive questions."
      : "NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool."
  );

  // Add instruction to mention tools used
  return withDeepSearchInstructions + "\n\nCRITICAL INSTRUCTION: At the end of your response, you MUST include a section that explicitly states which resources you used (Knowledge Base, Web Scraper, or Deep Search). If you didn't use any of these resources, state that you didn't use any specific resources.";
}

/**
 * Builds a complete system prompt for the specified prompt type
 * For agent types, it delegates to the buildSystemPrompt function
 * For widget types, it uses the widget-specific prompts
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

/**
 * Interface for tool results that can be added to the system prompt
 */
export interface ToolResults {
  ragContent?: string;    // Knowledge base results
  webScraper?: string;    // Web scraping results
  deepSearch?: string;    // Deep search results
  miscResults?: Record<string, string>; // Other custom tool results
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
export { WIDGET_BASE_PROMPT } from './widget-prompt';

// Convenience object for accessing common prompts
export const prompts = {
  // Main chat prompt types
  mainChat: buildSystemPrompt('default'),
  copywriting: buildSystemPrompt('copywriting'),
  googleAds: buildSystemPrompt('google-ads'),
  facebookAds: buildSystemPrompt('facebook-ads'),
  quiz: buildSystemPrompt('quiz'),

  // Widget-specific prompt type
  widget: WIDGET_BASE_PROMPT,

  // Function to build custom prompts with tool results
  withToolResults: (
    basePrompt: string,
    toolResults: ToolResults
  ) => enhancePromptWithToolResults(basePrompt, toolResults),

  // Function to build system prompt with DeepSearch instructions
  buildSystemPrompt: (
    agentType: AgentType,
    deepSearchEnabled = false
  ) => buildSystemPromptWithDeepSearch(agentType, deepSearchEnabled)
}; 