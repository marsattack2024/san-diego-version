import { edgeLogger } from '@/lib/logger/edge-logger';
import { ToolResults, enhancePromptWithToolResults } from '@/lib/agents/prompts';
import { createServerClient } from '@/lib/supabase/server';
import { Message } from 'ai';

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
 * Builds a system prompt with tool results, user profile data, chat history and reporting instructions
 */
export async function buildEnhancedSystemPrompt(
  basePrompt: string,
  toolResults: ToolResults,
  toolsUsed: string[],
  userId?: string
): Promise<string> {
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
  
  // If we have a userId, fetch and add user profile information
  if (userId) {
    try {
      const supabase = await createServerClient();
      
      // Fetch user profile
      const { data: userProfile, error: profileError } = await supabase
        .from('sd_user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
        
      if (!profileError && userProfile) {
        enhancedPrompt += `### PHOTOGRAPHY BUSINESS CONTEXT ###\nYou are speaking with a photography studio with the following details:\n`;
        
        if (userProfile.company_name) {
          enhancedPrompt += `- Studio Name: ${userProfile.company_name}\n`;
        }
        
        if (userProfile.website_url) {
          enhancedPrompt += `- Website: ${userProfile.website_url}\n`;
        }
        
        if (userProfile.location) {
          enhancedPrompt += `- Location: ${userProfile.location}\n`;
        }
        
        if (userProfile.company_description) {
          enhancedPrompt += `- Description: ${userProfile.company_description}\n`;
        }
        
        if (userProfile.website_summary) {
          enhancedPrompt += `- ${userProfile.website_summary}\n`;
        }
        
        enhancedPrompt += `\nPlease tailor your responses to be relevant to their photography business. This is a professional context where they are looking for assistance with their photography studio needs.\n\n`;
        
        edgeLogger.info('Added photography business profile to system prompt', { 
          userId,
          profileDataAvailable: !!userProfile,
          context: 'photography_studio'
        });
      }
      
      // Get relevant recent chat history (last 3 important exchanges)
      const { data: chatHistory, error: historyError } = await supabase
        .from('sd_chat_histories')
        .select('content, role, created_at, session_id, tools_used')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (!historyError && chatHistory && chatHistory.length > 0) {
        // Group by session_id to get conversations
        const sessionGroups: Record<string, typeof chatHistory> = {};
        
        chatHistory.forEach(msg => {
          if (!sessionGroups[msg.session_id]) {
            sessionGroups[msg.session_id] = [];
          }
          sessionGroups[msg.session_id].push(msg);
        });
        
        // Take only the most recent session for context
        const recentSessions = Object.keys(sessionGroups).slice(0, 1);
        
        if (recentSessions.length > 0) {
          enhancedPrompt += `### RECENT CONVERSATION CONTEXT ###\n`;
          
          recentSessions.forEach(sessionId => {
            // Sort messages by created_at
            const sessionMessages = sessionGroups[sessionId].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            if (sessionMessages.length > 0) {
              // Add only the 2-3 most recent exchanges per session to maintain context without overwhelming
              const recentMessages = sessionMessages.slice(-6);
              
              recentMessages.forEach(msg => {
                // Format the message content to be concise
                let formattedContent = msg.content;
                if (formattedContent.length > 150) {
                  formattedContent = formattedContent.substring(0, 150) + '...';
                }
                
                // Add role-specific formatting
                enhancedPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${formattedContent}\n`;
                
                // For assistant messages, include the tools used if available
                if (msg.role === 'assistant' && msg.tools_used && msg.tools_used.length > 0) {
                  const toolsStr = Array.isArray(msg.tools_used) 
                    ? msg.tools_used.join(', ')
                    : typeof msg.tools_used === 'object'
                      ? Object.keys(msg.tools_used).join(', ')
                      : String(msg.tools_used);
                      
                  enhancedPrompt += `(Used: ${toolsStr})\n`;
                }
              });
            }
          });
          
          enhancedPrompt += `\n`;
          
          edgeLogger.info('Added conversation context to system prompt', { 
            userId,
            sessionCount: recentSessions.length,
            messagesIncluded: sessionGroups[recentSessions[0]]?.length || 0
          });
        }
      }
    } catch (error) {
      edgeLogger.error('Error fetching user data for prompt enhancement', { error });
      // Continue without user data if there's an error
    }
  }
  
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
    toolsUsed,
    includesUserProfile: !!userId,
    includesTools: toolsUsed.length > 0
  });
  
  return enhancedPrompt;
}

/**
 * Builds a complete message array for the AI SDK, including system message with enhanced prompt
 * and properly formatted tool messages
 */
export async function buildAIMessages({
  basePrompt,
  toolResults,
  toolsUsed,
  userMessages,
  userId
}: {
  basePrompt: string;
  toolResults: ToolResults;
  toolsUsed: string[];
  userMessages: Message[];
  userId?: string;
}): Promise<Message[]> {
  // Build the enhanced system prompt
  const enhancedSystemPrompt = await buildEnhancedSystemPrompt(
    basePrompt,
    toolResults,
    toolsUsed,
    userId
  );
  
  // Create the system message
  const systemMessage: Message = {
    id: 'system-' + Date.now().toString(),
    role: 'system',
    content: enhancedSystemPrompt,
  };
  
  // Create tool messages for each tool result
  const toolMessages: Message[] = [];
  
  if (toolResults.ragContent && toolsUsed.includes('Knowledge Base')) {
    toolMessages.push({
      id: 'tool-kb-' + Date.now().toString(),
      role: 'assistant',
      content: `[Knowledge Base Results]\n${toolResults.ragContent}`
    });
  }
  
  if (toolResults.deepSearch && toolsUsed.includes('Deep Search')) {
    toolMessages.push({
      id: 'tool-ds-' + Date.now().toString(),
      role: 'assistant',
      content: `[Deep Search Results]\n${toolResults.deepSearch}`
    });
  }
  
  if (toolResults.webScraper && toolsUsed.includes('Web Scraper')) {
    toolMessages.push({
      id: 'tool-ws-' + Date.now().toString(),
      role: 'assistant',
      content: `[Web Scraper Results]\n${toolResults.webScraper}`
    });
  }
  
  // Log what we're building
  edgeLogger.info('Building AI SDK message array', {
    systemPromptLength: enhancedSystemPrompt.length,
    toolMessagesCount: toolMessages.length,
    userMessagesCount: userMessages.length,
    toolsUsed
  });
  
  // Return the complete message array
  return [
    systemMessage,
    ...userMessages,
    ...toolMessages
  ];
}

/**
 * Creates a complete request object for the AI SDK
 */
export async function buildAIRequest({
  basePrompt,
  toolResults,
  toolsUsed,
  messages,
  userId,
  modelName,
  tools = []
}: {
  basePrompt: string;
  toolResults: ToolResults;
  toolsUsed: string[];
  messages: Message[];
  userId?: string;
  modelName: string;
  tools?: any[];
}) {
  // Build the complete message array
  const aiMessages = await buildAIMessages({
    basePrompt,
    toolResults,
    toolsUsed,
    userMessages: messages,
    userId
  });
  
  // Return the complete request object
  return {
    messages: aiMessages,
    model: modelName,
    tools: tools.length > 0 ? tools : undefined,
    temperature: 0.7,
  };
} 