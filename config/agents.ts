import { Agent } from '@/types/chat/chat';

export const agents: Agent[] = [
  {
    id: 'profit-analyst',
    name: 'Profit Analyst',
    description: 'Analyzes financial data and provides profit insights',
    systemPrompt: 'You are a financial analyst AI assistant that specializes in profit analysis and business insights.',
  },
  {
    id: 'market-researcher',
    name: 'Market Researcher',
    description: 'Researches market trends and competitive analysis',
    systemPrompt: 'You are a market research AI assistant that specializes in industry trends and competitive analysis.',
  },
  {
    id: 'strategy-advisor',
    name: 'Strategy Advisor',
    description: 'Provides strategic business advice and planning',
    systemPrompt: 'You are a strategic advisor AI assistant that specializes in business strategy and planning.',
  },
];

export const defaultAgent = agents[0];

