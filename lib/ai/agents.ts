import { type AgentType } from '@/lib/agents/prompts';

/**
 * Agent definition interface for the dropdown selector
 */
export interface Agent {
  id: AgentType;
  name: string;
  description: string;
}

/**
 * List of available agents for the dropdown selector
 * These match the agent types defined in lib/agents/prompts
 */
export const agents: Agent[] = [
  {
    id: 'default',
    name: 'Default Agent',
    description: 'General marketing assistant for photographers',
  },
  {
    id: 'copywriting',
    name: 'Copywriting',
    description: 'Specialized in website, email, and marketing copy',
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    description: 'Expert in creating and optimizing Google Ads campaigns',
  },
  {
    id: 'facebook-ads',
    name: 'Facebook Ads',
    description: 'Focused on social media advertising strategies',
  },
  {
    id: 'quiz',
    name: 'Quiz Creator',
    description: 'Creates interactive quizzes and questionnaires for lead generation',
  },
]; 