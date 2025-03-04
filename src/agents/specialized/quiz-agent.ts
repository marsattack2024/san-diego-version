import { BaseAgent } from '../core/agent-base';
import { AgentContext, AgentType } from '../core/agent-types';
import { QUIZ_SYSTEM_PROMPT } from '../prompts/quiz-prompts';
import { dateTimeTool } from '../core/agent-tools';
import { createAgentLogger } from '../core/agent-logger';

/**
 * Quiz creation specialist agent
 */
export class QuizAgent extends BaseAgent {
  id: AgentType = 'quiz';
  name = 'Quiz Specialist';
  description = 'Expert in creating and managing interactive quizzes';
  capabilities = [
    'Create engaging quiz questions',
    'Design quiz flow and structure',
    'Develop scoring systems',
    'Generate educational assessments',
    'Create marketing and lead generation quizzes'
  ];
  icon = 'question-mark';
  systemPrompt = QUIZ_SYSTEM_PROMPT;
  tools = [dateTimeTool]; // Will add more specialized tools later
  
  private logger = createAgentLogger(this.id);
  
  constructor() {
    super();
    this.logger.info('Quiz agent initialized');
  }
  
  /**
   * Override formatPrompt to add agent-specific formatting
   */
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);
    return `${basePrompt}\n\nRemember to focus on engagement, clarity, and the specific goals of the quiz.`;
  }
} 