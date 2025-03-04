import { Message } from 'ai';

export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  icon?: string;
}

export interface DeepSearchOptions {
  enabled: boolean;
  query?: string;
  sources?: string[];
}

