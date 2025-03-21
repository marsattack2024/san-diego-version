// No imports needed at the top level
// We'll import models dynamically when needed

// Create optimized model loaders that only import what's needed when requested
// This improves tree shaking and reduces initial bundle size
export async function loadModel(modelName: string) {
  // Load the appropriate model based on the requested name
  if (modelName === 'gpt-4o' || modelName === 'gpt-4o-mini') {
    // Import OpenAI models only when requested
    const { openai } = await import('@ai-sdk/openai');
    return openai(modelName);
  } 
  
  if (modelName === 'reasoning-model') {
    // Import Fireworks models only when requested
    const [{ fireworks }, { wrapLanguageModel, extractReasoningMiddleware }] = await Promise.all([
      import('@ai-sdk/fireworks'),
      import('ai')
    ]);
    
    return wrapLanguageModel({
      model: fireworks('accounts/fireworks/models/deepseek-r1'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  }
  
  throw new Error(`Unknown model: ${modelName}`);
}

// For backwards compatibility, provide a simple provider object
// This is deprecated and will be removed in a future version
export const myProvider = {
  languageModel: async (modelName: string) => {
    return await loadModel(modelName);
  }
}; 