import { type AgentType } from '@/lib/agents/prompts';

export interface Agent {
  id: AgentType;
  name: string;
  description: string;
  capabilities: string[];
  icon?: string;
}

export const agents: Agent[] = [
  {
    id: 'default',
    name: 'Default (Auto)',
    description: 'A versatile assistant that can help with a wide range of tasks',
    capabilities: [
      'Answer general questions',
      'Provide information on various topics',
      'Assist with basic tasks',
      'Recommend specialized agents when appropriate'
    ]
  },
  {
    id: 'google-ads',
    name: 'Google Ads Agent',
    description: 'Specialized in Google Ads campaign management and optimization',
    capabilities: [
      'Create Google Ads campaigns',
      'Optimize ad performance',
      'Analyze campaign metrics',
      'Suggest keyword strategies'
    ]
  },
  {
    id: 'facebook-ads',
    name: 'Facebook Ads Agent',
    description: 'Expert in Facebook and Instagram advertising',
    capabilities: [
      'Design Facebook ad campaigns',
      'Target specific audiences',
      'Optimize social media ad spend',
      'Create engaging ad copy'
    ]
  },
  {
    id: 'copywriting',
    name: 'Copywriting Agent',
    description: 'Specialized in creating compelling marketing copy',
    capabilities: [
      'Write persuasive ad copy',
      'Create engaging content',
      'Develop brand messaging',
      'Optimize copy for conversions'
    ]
  },
  {
    id: 'quiz',
    name: 'Quiz Agent',
    description: 'Expert in creating interactive quizzes and assessments',
    capabilities: [
      'Design educational quizzes',
      'Create engaging trivia',
      'Develop assessment tools',
      'Generate quiz questions and answers'
    ]
  }
]; 