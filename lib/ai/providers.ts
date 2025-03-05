import { openai } from '@ai-sdk/openai';
import { fireworks } from '@ai-sdk/fireworks';
import { customProvider, wrapLanguageModel, extractReasoningMiddleware } from 'ai';

// Create custom provider with multiple models
export const myProvider = customProvider({
  languageModels: {
    'gpt-4o': openai('gpt-4o'),
    'gpt-4o-mini': openai('gpt-4o-mini'),
    'reasoning-model': wrapLanguageModel({
      model: fireworks('accounts/fireworks/models/deepseek-r1'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
  }
}); 