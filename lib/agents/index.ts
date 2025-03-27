// Import only the core agent types that are still used
import { AgentType, Agent } from './core/agent-types';

// Create a simple agent list without specialized implementations
export const agents: Record<AgentType, Agent> = {} as Record<AgentType, Agent>;

// Export the core agent types
export * from './core/agent-types';
export * from './core/agent-tools'; 