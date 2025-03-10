import { type Message } from 'ai';
import { buildSystemPrompt, type ToolResults, type AgentType, AGENT_PROMPTS } from './prompts';
import { type ToolSet } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { logger } from '../logger/edge-logger';

// Keywords that trigger specific agents
const AGENT_KEYWORDS: Record<AgentType, string[]> = {
  'default': [],
  'copywriting': [
    'copywriting', 'copy', 'website text', 'landing page', 'sales page', 'email copy',
    'marketing copy', 'write copy', 'content writing', 'sales letter', 'website content',
    'product description', 'brand message', 'tagline', 'slogan', 'value proposition',
    'messaging', 'brand voice', 'brand story', 'write content', 'content strategy',
    'write a website', 'create a website', 'website copy', 'website structure', 'site content',
    'web content', 'web copy', 'website sections', 'about page', 'contact page', 'services page',
    'homepage content', 'write website', 'create website', 'website text', 'full website',
    'website for', 'site for', 'web page content', 'website','web page copy', 'website creation'
  ],
  'google-ads': [
    'google ads', 'google ad', 'google advertising', 'search ads', 'ppc', 'pay per click',
    'adwords', 'search campaign', 'display ads', 'google campaign', 'ad copy', 'ad text',
    'google keywords', 'search terms', 'ad extensions', 'quality score', 'ad rank',
    'google search ads', 'write google ads', 'create google ads'
  ],
  'facebook-ads': [
    'facebook ad', 'facebook ads', 'social ad', 'instagram ad', 'meta ad',
    'facebook campaign', 'instagram campaign', 'meta campaign', 'social media ad',
    'facebook advertising', 'instagram advertising', 'meta advertising',
    'facebook audience', 'lookalike audience', 'custom audience', 'targeting',
    'facebook pixel', 'conversion campaign', 'engagement campaign', 'lead generation',
    'carousel ad', 'stories ad', 'reels ad', 'messenger ad', 'facebook business',
    'meta business', 'social media marketing', 'facebook marketing'
  ],
  'quiz': [
    'quiz', 'question', 'test', 'assessment', 'questionnaire',
    'survey', 'poll', 'typeform', 'google form', 'microsoft form',
    'multiple choice', 'knowledge check', 'evaluation', 'exam',
    'interactive quiz', 'personality quiz', 'trivia', 'quiz maker',
    'assessment tool', 'feedback form', 'scoring', 'grading',
    'quiz template', 'quiz questions', 'interactive assessment'
  ]
};

// Common tool description for all agents
const COMMON_TOOL_DESCRIPTION = `
You have access to the following resources:
- Knowledge Base: Retrieve information from our internal knowledge base
- Web Scraper: Extract content from specific URLs provided by the user
- Deep Search: Conduct in-depth research on complex topics using Perplexity AI

Use these resources when appropriate to provide accurate and comprehensive responses.
`;

export class AgentRouter {
  /**
   * Routes a message to the appropriate agent based on the selected agent and message content
   * @param selectedAgentId The currently selected agent
   * @param messages The chat messages
   * @returns The agent type to use
   */
  routeMessage(selectedAgentId: AgentType, messages: Message[]): AgentType {
    edgeLogger.info('Agent router processing message', { 
      selectedAgentId, 
      messagesCount: messages.length 
    });
    
    // If user has explicitly selected a non-default agent, use that
    if (selectedAgentId !== 'default') {
      logger.info('Using explicitly selected agent', { 
        selectedAgentId, 
        selectionMethod: 'user-selected',
        important: true
      });
      return selectedAgentId;
    }

    // Auto-routing only happens from the default agent
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      edgeLogger.info('No user message to route, using default agent');
      return 'default';
    }

    const content = lastMessage.content.toLowerCase();
    edgeLogger.info('Routing based on message content', { 
      contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : '') 
    });

    // Create a scoring system for each agent type
    const scores: Record<AgentType, number> = {
      'default': 0,
      'copywriting': 0,
      'google-ads': 0,
      'facebook-ads': 0,
      'quiz': 0
    };

    // Check for keywords that would trigger a specific agent
    for (const [agentType, keywords] of Object.entries(AGENT_KEYWORDS)) {
      if (agentType === 'default') continue;
      
      for (const keyword of keywords) {
        // Check for exact matches (higher score)
        if (content.includes(keyword.toLowerCase())) {
          // Multi-word keywords get higher scores
          const wordCount = keyword.split(' ').length;
          const score = wordCount * 2;
          scores[agentType as AgentType] += score;
          edgeLogger.debug('Keyword match found', { 
            keyword, 
            agentType, 
            score 
          });
          
          // Bonus points for keywords at the beginning of the message
          if (content.startsWith(keyword.toLowerCase())) {
            const bonusScore = 5;
            scores[agentType as AgentType] += bonusScore;
            edgeLogger.debug('Keyword at start of message', { 
              keyword, 
              bonusScore 
            });
          }
          
          // Bonus points for exact phrase matches
          const exactPhraseRegex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i');
          if (exactPhraseRegex.test(content)) {
            const exactMatchBonus = 3;
            scores[agentType as AgentType] += exactMatchBonus;
            edgeLogger.debug('Exact phrase match', { 
              keyword, 
              exactMatchBonus 
            });
          }
        }
      }
    }

    // Find the agent with the highest score
    let highestScore = 0;
    let selectedAgent: AgentType = 'default';

    for (const [agentType, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        selectedAgent = agentType as AgentType;
      }
    }

    // Log all scores for debugging
    edgeLogger.debug('Agent routing scores', { scores });

    // Only route to a specialized agent if the score is above a threshold
    const routingThreshold = 5;
    if (highestScore >= routingThreshold) {
      edgeLogger.info('Auto-routed to specialized agent', { 
        selectedAgent, 
        score: highestScore, 
        threshold: routingThreshold 
      });
      
      logger.info('Auto-routed message to specialized agent', {
        agentType: selectedAgent,
        selectionMethod: 'auto-routing',
        score: highestScore,
        threshold: routingThreshold,
        important: true
      });
      
      return selectedAgent;
    }

    // Default to the default agent if no keywords match or score is too low
    edgeLogger.info('No agent scored above threshold, using default agent', { 
      highestScore, 
      threshold: routingThreshold 
    });
    
    logger.info('Using default agent (no specialized agent matched)', {
      selectionMethod: 'auto-routing',
      highestScore,
      threshold: routingThreshold,
      important: true
    });
    
    return 'default';
  }

  /**
   * Gets the system prompt for the specified agent
   * @param agentType The agent type
   * @param deepSearchEnabled Whether DeepSearch is enabled
   * @returns The system prompt
   */
  getSystemPrompt(agentType: AgentType, deepSearchEnabled = false): string {
    // Log agent selection with context
    logger.info('Agent selected for conversation', {
      agentType,
      selectionMethod: agentType === 'default' ? 'auto-routing' : 'user-selected',
      deepSearchEnabled,
      important: true
    });
    
    // Build the system prompt in a simple, linear fashion
    const systemPrompt = [
      // 1. Start with the base prompt and specialized prompt if applicable
      buildSystemPrompt(agentType),
      
      // 2. Add tool descriptions
      COMMON_TOOL_DESCRIPTION,
      
      // 3. Add DeepSearch-specific instructions
      deepSearchEnabled
        ? "IMPORTANT: DeepSearch is enabled for this conversation. Use the deepSearch tool for research-intensive questions."
        : "NOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool.",
      
      // 4. Add critical instruction to mention tools used
      "CRITICAL INSTRUCTION: At the end of your response, you MUST include a section that explicitly states which resources you used (Knowledge Base, Web Scraper, or Deep Search). If you didn't use any of these resources, state that you didn't use any specific resources."
    ].join("\n\n");
    
    // Log the system prompt creation
    edgeLogger.debug('System prompt built successfully', {
      agentType,
      promptLength: systemPrompt.length
    });
    
    return systemPrompt;
  }
}