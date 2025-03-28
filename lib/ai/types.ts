/**
 * Interface defining a chat model configuration
 */
export interface ChatModel {
    id: string;
    name: string;
    description: string;
    maxTokens: number;
    provider: 'openai' | 'anthropic' | 'google';
} 