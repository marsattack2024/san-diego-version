import { BaseAgent } from '../core/agent-base';
import { AgentType, AgentContext } from '../core/agent-types';
import { DEFAULT_SYSTEM_PROMPT } from '../prompts/default-prompts';
import { echoTool, dateTimeTool } from '../core/agent-tools';
import { 
  webScraperTool, 
  urlDetectionTool, 
  webSearchTool, 
  deepSearchTool, 
  combinedSearchTool 
} from '../tools';
import { createAgentLogger } from '../core/agent-logger';

/**
 * Default general-purpose agent
 */
export class DefaultAgent extends BaseAgent {
  id: AgentType = 'default';
  name = 'General Assistant';
  description = 'A versatile assistant that can help with a wide range of tasks';
  capabilities = [
    'Answer general questions',
    'Provide information on various topics',
    'Assist with basic tasks',
    'Scrape and analyze web content',
    'Perform web searches for up-to-date information',
    'Conduct deep research on complex topics',
    'Recommend other specialized agents when appropriate'
  ];
  icon = 'bot';
  systemPrompt = DEFAULT_SYSTEM_PROMPT;
  tools = [
    echoTool, 
    dateTimeTool, 
    webScraperTool, 
    urlDetectionTool,
    webSearchTool,
    deepSearchTool,
    combinedSearchTool
  ];
  
  private logger = createAgentLogger(this.id);
  
  constructor() {
    super();
    this.logger.info('Default agent initialized');
  }
  
  /**
   * Override formatPrompt to add agent-specific formatting if needed
   */
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);
    
    // Add a hint about specialized agents if appropriate
    const enhancedPrompt = `${basePrompt}

If you think another specialized agent would be better suited to help with this request, please let me know. I can connect you with:
- Google Ads Agent for advertising on Google
- Facebook Ads Agent for social media advertising
- Copywriting Agent for marketing content
- Quiz Agent for creating interactive quizzes

I can also help you analyze web content and perform searches. If you provide a URL, I'll automatically scrape it. If you need up-to-date information, I can perform web searches or conduct deep research on complex topics.`;
    
    return enhancedPrompt;
  }
} 