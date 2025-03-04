import { AgentRouter } from './core/agent-router';
import { DefaultAgent } from './specialized/default-agent';
import { GoogleAdsAgent } from './specialized/google-ads-agent';
import { FacebookAdsAgent } from './specialized/facebook-ads-agent';
import { CopywritingAgent } from './specialized/copywriting-agent';
import { QuizAgent } from './specialized/quiz-agent';

// Re-export agent types
export * from './core/agent-types';
export * from './core/agent-base';
export * from './core/agent-router';
export * from './core/agent-tools';
export * from './core/agent-logger';

// Re-export agent context separately to avoid naming conflicts
export { createAgentContext } from './core/agent-context';

// Re-export specialized agents
export {
  DefaultAgent,
  GoogleAdsAgent,
  FacebookAdsAgent,
  CopywritingAgent,
  QuizAgent
};

// Initialize the agent router with all available agents
const agentRouter = new AgentRouter();
agentRouter.registerAgents([
  new DefaultAgent(),
  new GoogleAdsAgent(),
  new FacebookAdsAgent(),
  new CopywritingAgent(),
  new QuizAgent()
]);

// Export the initialized router
export { agentRouter }; 