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
 * Default truncation limits - optimized for large content
 * Reduced to prevent memory issues while maintaining useful context
 */
const DEFAULT_TRUNCATION_LIMITS: TruncationConfig = {
  ragMaxLength: 6000,       // Further reduced from 8000 to prevent timeout
  deepSearchMaxLength: 3000, // Further reduced from 4000 to prevent timeout
  webScraperMaxLength: 5000  // Further reduced from 6000 to prevent timeout
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
 * Extracts the most relevant parts of content by:
 * 1. Keeping essential elements (headings, first sentences of paragraphs)
 * 2. Prioritizing key sections based on semantic relevance
 * 3. Ensuring key information isn't truncated mid-section
 * 
 * This is more sophisticated than simple truncation and preserves meaning better.
 */
export function extractRelevantContent(content: string, maxLength: number, query: string = ""): string {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  
  // Log original content size
  edgeLogger.info('Smart content extraction starting', {
    originalLength: content.length,
    targetLength: maxLength,
    hasQuery: !!query
  });
  
  // For extremely large content, do a preliminary truncation to avoid memory issues
  // This is a safeguard for the edge function memory limits
  const MAX_SAFE_PROCESSING_LENGTH = 150000;
  let preprocessedContent = content;
  if (content.length > MAX_SAFE_PROCESSING_LENGTH) {
    edgeLogger.warn('Content too large for smart extraction, performing pre-truncation', {
      originalLength: content.length,
      truncatedTo: MAX_SAFE_PROCESSING_LENGTH
    });
    
    // Extract beginning and end portions, as they're often most important
    const startPortion = content.substring(0, Math.floor(MAX_SAFE_PROCESSING_LENGTH * 0.6));
    const endPortion = content.substring(content.length - Math.floor(MAX_SAFE_PROCESSING_LENGTH * 0.4));
    preprocessedContent = startPortion + "\n\n[... content truncated for processing ...]\n\n" + endPortion;
  }
  
  // Split content into sections (using headings as delimiters)
  const sections = preprocessedContent.split(/\n(?=#{1,6}\s|<h[1-6]>)/);
  
  // If we have a query, score sections by relevance
  let scoredSections = sections.map((section, index) => {
    // Calculate a basic relevance score based on keyword matching
    let score = 0;
    
    // Higher score for earlier sections (often more important)
    score += Math.max(0, 10 - (index * 0.5));
    
    // If we have a query, check for keyword matches
    if (query) {
      const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
      keywords.forEach(keyword => {
        const matches = (section.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
        score += matches * 2;
      });
    }
    
    // Higher score for sections with headings, lists, and structured content
    if (section.match(/^#{1,3}\s|<h[1-3]>/)) score += 5;  // Main headings
    if (section.match(/\n[-*+]\s|\n\d+\.\s/)) score += 3; // Lists
    if (section.match(/\b(features?|benefits?|how to|why|what|when|where)\b/i)) score += 2; // Key terms
    
    return { section, score };
  });
  
  // Sort sections by score (high to low)
  scoredSections.sort((a, b) => b.score - a.score);
  
  // Set a lower target length to account for the note we'll add at the end
  const effectiveMaxLength = Math.max(maxLength - 100, Math.floor(maxLength * 0.95));
  
  // Start building final content with highest-scored sections
  let result = '';
  let addedSections = 0;
  
  for (const { section, score } of scoredSections) {
    // Skip empty sections
    if (!section.trim()) continue;
    
    // Add full sections until we approach the limit
    if (result.length + section.length <= effectiveMaxLength) {
      result += (result ? "\n\n" : "") + section;
      addedSections++;
      continue;
    }
    
    // If we've already added some sections and we're close to the limit, stop
    if (addedSections > 0 && result.length > effectiveMaxLength * 0.8) {
      break;
    }
    
    // For the last section, try to extract the most important part
    // Extract first sentence and/or heading from remaining section
    const firstSentenceMatch = section.match(/^([^.!?]*[.!?])/);
    const headingMatch = section.match(/^(#{1,6}\s.+|<h[1-6]>.+?<\/h[1-6]>)/);
    
    const extractedPart = headingMatch ? 
                        headingMatch[0] + "\n" + (firstSentenceMatch ? firstSentenceMatch[0] : "") :
                        (firstSentenceMatch ? firstSentenceMatch[0] : section.slice(0, Math.min(100, section.length)));
    
    // Only add if we have space
    if (result.length + extractedPart.length <= effectiveMaxLength) {
      result += (result ? "\n\n" : "") + extractedPart;
    }
    
    // Check if we've reached target length
    if (result.length >= effectiveMaxLength * 0.9) break;
  }
  
  // Add a note indicating content was intelligently extracted
  result += `\n\n[Content intelligently extracted from ${content.length} characters of original material, prioritizing ${query ? "content relevant to your query" : "the most important information"}]`;
  
  edgeLogger.info('Smart content extraction complete', {
    originalLength: content.length,
    extractedLength: result.length,
    compressionRatio: (result.length / content.length).toFixed(2),
    sectionsIncluded: addedSections
  });
  
  return result;
}

/**
 * Optimizes tool results by intelligently extracting the most relevant content
 * rather than just truncating, to maximize relevance while controlling token usage
 */
export function optimizeToolResults(
  toolResults: ToolResults,
  config: TruncationConfig = DEFAULT_TRUNCATION_LIMITS,
  query: string = ""
): ToolResults {
  const { ragMaxLength, deepSearchMaxLength, webScraperMaxLength } = {
    ...DEFAULT_TRUNCATION_LIMITS,
    ...config
  };
  
  const optimizedResults: ToolResults = {};
  
  // Optimize RAG content if available
  if (toolResults.ragContent) {
    optimizedResults.ragContent = extractRelevantContent(
      toolResults.ragContent,
      ragMaxLength!,
      query
    );
  }
  
  // Optimize Deep Search content if available
  if (toolResults.deepSearch) {
    optimizedResults.deepSearch = extractRelevantContent(
      toolResults.deepSearch,
      deepSearchMaxLength!,
      query
    );
  }
  
  // Optimize Web Scraper content if available
  if (toolResults.webScraper) {
    optimizedResults.webScraper = extractRelevantContent(
      toolResults.webScraper,
      webScraperMaxLength!,
      query
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
  userId?: string,
  userQuery?: string
): Promise<string> {
  // Optimize tool results to reduce token usage - now with query context for better relevance
  const optimizedResults = optimizeToolResults(toolResults, undefined, userQuery);
  
  // Add a summary of tools used at the beginning in priority order
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
        
        // Define chat history item interface
        interface ChatHistoryItem {
          session_id: string;
          role: 'user' | 'assistant' | 'system' | 'tool';
          content: string;
          created_at: string;
          tools_used?: any;
        }
        
        chatHistory.forEach((msg: ChatHistoryItem) => {
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
              (a: ChatHistoryItem, b: ChatHistoryItem) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            if (sessionMessages.length > 0) {
              // Add only the 2-3 most recent exchanges per session to maintain context without overwhelming
              const recentMessages = sessionMessages.slice(-6);
              
              recentMessages.forEach((msg: ChatHistoryItem) => {
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
  
  // Add the base prompt (System Message is the highest priority)
  enhancedPrompt += basePrompt;
  
  // Enhance with tool results in priority order (manually instead of using enhancePromptWithToolResults)
  // This ensures we follow priority: 1. System Message 2. RAG 3. Web Scraper 4. Deep Search
  
  // Add Knowledge Base (RAG) results - highest priority after system message
  if (optimizedResults.ragContent && toolsUsed.includes('Knowledge Base')) {
    enhancedPrompt += `\n\n### KNOWLEDGE BASE RESULTS ###\n${optimizedResults.ragContent}`;
    edgeLogger.info('Added Knowledge Base results to prompt', {
      contentLength: optimizedResults.ragContent.length
    });
  }
  
  // Add Web Scraper results - second priority
  if (optimizedResults.webScraper && toolsUsed.includes('Web Scraper')) {
    enhancedPrompt += `\n\n### WEB CONTENT ###\n${optimizedResults.webScraper}`;
    edgeLogger.info('Added Web Scraper results to prompt', {
      contentLength: optimizedResults.webScraper.length
    });
  }
  
  // Add Deep Search results - lowest priority
  if (optimizedResults.deepSearch && toolsUsed.includes('Deep Search')) {
    enhancedPrompt += `\n\n### DEEP SEARCH RESULTS ###\n${optimizedResults.deepSearch}`;
    edgeLogger.info('Added Deep Search results to prompt', {
      contentLength: optimizedResults.deepSearch.length
    });
  }
  
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
    includesTools: toolsUsed.length > 0,
    toolPriorities: 'System > RAG > Web Scraper > Deep Search'
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
  // Extract the last user query to use for content optimization
  const lastUserMessage = userMessages
    .filter(msg => msg.role === 'user')
    .pop();
  const userQuery = lastUserMessage?.content || '';
  
  // Build the enhanced system prompt
  const enhancedSystemPrompt = await buildEnhancedSystemPrompt(
    basePrompt,
    toolResults,
    toolsUsed,
    userId,
    userQuery // Pass the user query for more relevant context extraction
  );
  
  // Create the system message
  const systemMessage: Message = {
    id: 'system-' + Date.now().toString(),
    role: 'system',
    content: enhancedSystemPrompt,
  };
  
  // Create tool messages for each tool result in the correct priority order:
  // 1. Knowledge Base (RAG), 2. Web Scraper, 3. Deep Search
  const toolMessages: Message[] = [];
  
  // 1. Knowledge Base (RAG) - Highest priority after system message
  if (toolResults.ragContent && toolsUsed.includes('Knowledge Base')) {
    toolMessages.push({
      id: 'tool-kb-' + Date.now().toString(),
      role: 'assistant',
      content: `[Knowledge Base Results]\n${toolResults.ragContent}`
    });
  }
  
  // 2. Web Scraper - Second priority
  if (toolResults.webScraper && toolsUsed.includes('Web Scraper')) {
    toolMessages.push({
      id: 'tool-ws-' + Date.now().toString(),
      role: 'assistant',
      content: `[Web Scraper Results]\n${toolResults.webScraper}`
    });
  }
  
  // 3. Deep Search - Lowest priority
  if (toolResults.deepSearch && toolsUsed.includes('Deep Search')) {
    toolMessages.push({
      id: 'tool-ds-' + Date.now().toString(),
      role: 'assistant',
      content: `[Deep Search Results]\n${toolResults.deepSearch}`
    });
  }
  
  // Log what we're building
  edgeLogger.info('Building AI SDK message array', {
    systemPromptLength: enhancedSystemPrompt.length,
    toolMessagesCount: toolMessages.length,
    userMessagesCount: userMessages.length,
    toolsUsed,
    toolPriorities: 'System > RAG > Web Scraper > Deep Search'
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
    temperature: 0.4,
  };
}