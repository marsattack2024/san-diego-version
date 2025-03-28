import { ChatModel } from "./types";

export const chatModels: ChatModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model for complex tasks',
    maxTokens: 25000,
    provider: 'openai'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and efficient for most tasks',
    maxTokens: 4096,
    provider: 'openai'
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    description: 'Anthropic\'s most powerful model',
    maxTokens: 8192,
    provider: 'anthropic'
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    description: 'Balanced performance and efficiency',
    maxTokens: 4096,
    provider: 'anthropic'
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    description: 'Google\'s advanced model',
    maxTokens: 4096,
    provider: 'google'
  }
]; 