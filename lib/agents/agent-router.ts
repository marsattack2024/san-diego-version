import { type Message } from 'ai';
import { buildSystemPrompt, enhancePromptWithToolResults, type ToolResults, type AgentType } from './prompts';
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

// Tool capability descriptions for each agent
const AGENT_TOOL_DESCRIPTIONS: Record<AgentType, string> = {
  'default': `
You have access to the following tools:
- RAG: Retrieve information from the knowledge base
- WebSearch: Search the web for up-to-date information
- DeepSearch: Conduct in-depth research on complex topics

Use these tools when appropriate to provide accurate and comprehensive responses.
`,
  'copywriting': `
You have access to the following tools:
- RAG: Retrieve information from the knowledge base about copywriting best practices and examples
- WebSearch: Search the web for up-to-date information on brands, competitors, and industry trends
- DeepSearch: Conduct in-depth research on target audiences and market positioning

Use these tools when appropriate to create compelling and effective copy.
`,
  'google-ads': `
You have access to the following tools:
- RAG: Retrieve information from the knowledge base about Google Ads best practices
- WebSearch: Search the web for up-to-date information on Google Ads policies and features
- DeepSearch: Conduct in-depth research on keywords, competitors, and industry benchmarks

Use these tools when appropriate to create effective Google Ads campaigns.
`,
  'facebook-ads': `
You have access to the following tools:
- RAG: Retrieve information from the knowledge base about Facebook Ads best practices
- WebSearch: Search the web for up-to-date information on Facebook Ads policies and features
- DeepSearch: Conduct in-depth research on audience targeting, creative formats, and performance metrics

Use these tools when appropriate to create effective Facebook Ads campaigns.
`,
  'quiz': `
You have access to the following tools:
- RAG: Retrieve information from the knowledge base about quiz design best practices
- WebSearch: Search the web for up-to-date information on quiz platforms and features
- DeepSearch: Conduct in-depth research on quiz topics, question formats, and assessment methodologies

Use these tools when appropriate to create engaging and effective quizzes.
`
};

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
    const routingThreshold = 5; // Minimum score to trigger routing
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
   * @param toolResults The tool results
   * @param deepSearchEnabled Whether DeepSearch is enabled
   * @returns The system prompt
   */
  getSystemPrompt(agentType: AgentType, toolResults: ToolResults = {}, deepSearchEnabled = false): string {
    // Log agent selection with context
    logger.info('Agent selected for conversation', {
      agentType,
      selectionMethod: agentType === 'default' ? 'auto-routing' : 'user-selected',
      hasToolResults: Object.keys(toolResults).length > 0,
      deepSearchEnabled,
      important: true
    });
    
    // Start with the base prompt
    let prompt = buildSystemPrompt(agentType);
    
    // Add tool descriptions for this agent
    prompt += `\n\n${AGENT_TOOL_DESCRIPTIONS[agentType]}`;
    
    // Add DeepSearch-specific instructions if explicitly enabled by the user
    if (deepSearchEnabled) {
      prompt += `\n\nIMPORTANT: DeepSearch is enabled for this conversation. You MUST use the deepSearch tool for research-intensive questions, complex topics, or when comprehensive information is needed.`;
      
      // If DeepSearch results are already available, note that in the prompt
      if (toolResults.deepSearch) {
        prompt += `\n\nDeepSearch results have already been included below.`;
      }
    } else {
      // Make it clear that DeepSearch should NOT be used unless explicitly enabled
      prompt += `\n\nNOTE: DeepSearch is NOT enabled for this conversation. Do NOT use the deepSearch tool even if it seems appropriate. Use other available tools like comprehensiveScraper or getInformation instead.`;
    }
    
    // Add tool results in priority order
    const enhancedPrompt = enhancePromptWithToolResults(prompt, toolResults);
    
    edgeLogger.debug('System prompt built successfully', {
      agentType,
      promptLength: enhancedPrompt.length,
      hasRagContent: !!toolResults?.ragContent,
      hasWebScraperContent: !!toolResults?.webScraper,
      hasDeepSearchContent: !!toolResults?.deepSearch
    });
    
    return enhancedPrompt;
  }
}