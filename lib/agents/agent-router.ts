import { type Message } from 'ai';
import { type AgentType } from '@/components/agent-selector';
import { DEFAULT_SYSTEM_PROMPT } from './prompts/default-prompts';
import { COPYWRITING_SYSTEM_PROMPT } from './prompts/copywriting-prompts';
import { GOOGLE_ADS_SYSTEM_PROMPT } from './prompts/google-ads-prompts';
import { FACEBOOK_ADS_SYSTEM_PROMPT } from './prompts/facebook-ads-prompts';
import { QUIZ_SYSTEM_PROMPT } from './prompts/quiz-prompts';
import { type ToolSet } from 'ai';

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
    console.log(`Agent router: selectedAgentId=${selectedAgentId}, messages.length=${messages.length}`);
    
    // If user has explicitly selected a non-default agent, use that
    if (selectedAgentId !== 'default') {
      console.log(`Using explicitly selected agent: ${selectedAgentId}`);
      return selectedAgentId;
    }

    // Auto-routing only happens from the default agent
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      console.log('No user message to route, using default agent');
      return 'default';
    }

    const content = lastMessage.content.toLowerCase();
    console.log(`Routing based on message content: "${content.substring(0, 50)}..."`);

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
        // Exact match gets higher score
        if (content.includes(keyword.toLowerCase())) {
          // Multi-word keywords get higher scores
          const wordCount = keyword.split(' ').length;
          const score = wordCount * 2;
          scores[agentType as AgentType] += score;
          console.log(`Found keyword "${keyword}" for agent: ${agentType}, adding score: ${score}`);
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

    // Only route to a specialized agent if the score is above a threshold
    if (highestScore > 0) {
      console.log(`Selected agent: ${selectedAgent} with score: ${highestScore}`);
      return selectedAgent;
    }

    // Default to the default agent if no keywords match
    console.log('No keywords matched, using default agent');
    return 'default';
  }

  /**
   * Gets the system prompt for the specified agent
   * @param agentType The agent type
   * @param deepSearchEnabled Whether DeepSearch is enabled
   * @returns The system prompt
   */
  getSystemPrompt(agentType: AgentType, deepSearchEnabled: boolean = false): string {
    // Get the base system prompt for the agent
    let prompt: string;
    switch (agentType) {
      case 'copywriting':
        prompt = COPYWRITING_SYSTEM_PROMPT;
        break;
      case 'google-ads':
        prompt = GOOGLE_ADS_SYSTEM_PROMPT;
        break;
      case 'facebook-ads':
        prompt = FACEBOOK_ADS_SYSTEM_PROMPT;
        break;
      case 'quiz':
        prompt = QUIZ_SYSTEM_PROMPT;
        break;
      default:
        prompt = DEFAULT_SYSTEM_PROMPT;
        break;
    }
    
    // Add DeepSearch-specific instructions if enabled
    if (deepSearchEnabled) {
      prompt += `\n\nIMPORTANT: DeepSearch is enabled for this conversation. You MUST use the deepSearch tool for research-intensive questions, complex topics, or when comprehensive information is needed. The deepSearch tool provides much more thorough and reliable information than regular search.`;
    }
    
    return prompt;
  }

  /**
   * Configures tools for the specified agent
   * @param agentType The agent type
   * @param availableTools The available tools
   * @returns The configured tools
   */
  configureTools<T extends ToolSet>(agentType: AgentType, availableTools: T): T {
    // Log which tools are being configured for the agent
    console.log(`Configuring tools for agent ${agentType}`);
    
    // Return all tools - they are already properly configured in the chat route
    // Each tool has its own description and parameters defined there
    return availableTools;
  }
} 