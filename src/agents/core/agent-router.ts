import { Agent, AgentContext, AgentResponse, AgentType, createAgentMessage } from './agent-types';
import { createRouterLogger } from './agent-logger';

/**
 * Router that directs messages to the appropriate agent
 */
export class AgentRouter {
  private agents: Map<AgentType, Agent>;
  private logger = createRouterLogger();
  
  constructor() {
    this.agents = new Map();
    this.logger.info('Initializing agent router');
  }
  
  /**
   * Register an agent with the router
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.logger.info({ agentId: agent.id }, `Registered agent: ${agent.name}`);
  }
  
  /**
   * Register multiple agents with the router
   */
  registerAgents(agents: Agent[]): void {
    agents.forEach(agent => this.registerAgent(agent));
    this.logger.info({ count: agents.length }, `Registered ${agents.length} agents`);
  }
  
  /**
   * Get an agent by type
   */
  getAgent(type: AgentType): Agent {
    const agent = this.agents.get(type);
    if (!agent) {
      this.logger.error({ agentType: type }, `Agent type "${type}" not found`);
      throw new Error(`Agent type "${type}" not found`);
    }
    return agent;
  }
  
  /**
   * Get all registered agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * Route a message to the appropriate agent
   */
  async routeMessage(
    message: string, 
    context: AgentContext, 
    agentType: AgentType = 'default'
  ): Promise<AgentResponse> {
    this.logger.info({
      agentType,
      sessionId: context.sessionId,
      conversationId: context.conversationId
    }, `Routing message to ${agentType} agent`);
    
    try {
      // Check if we need to switch agents
      if (context.metadata.currentAgentId && context.metadata.currentAgentId !== agentType) {
        const previousAgentId = context.metadata.currentAgentId;
        
        // Add a system message about the agent change
        const systemMessage = createAgentMessage(
          'system',
          `Switching from ${previousAgentId} agent to ${agentType} agent`
        );
        
        context.history.push(systemMessage);
        this.logger.info({
          previousAgentId,
          newAgentId: agentType
        }, `Switching agents from ${previousAgentId} to ${agentType}`);
      }
      
      // Update current agent in context
      context.metadata.currentAgentId = agentType;
      
      // Get the agent and process the message
      const agent = this.getAgent(agentType);
      return await agent.processMessage(message, context);
    } catch (error) {
      this.logger.error({
        error,
        agentType
      }, `Error routing message to ${agentType} agent`);
      
      // Create error message
      const errorMessage = createAgentMessage(
        'assistant',
        'I encountered an error while processing your request. Please try again.',
        { error: String(error) }
      );
      
      // Add error message to context
      context.history.push(errorMessage);
      
      return {
        message: errorMessage,
        processingTimeMs: 0
      };
    }
  }
  
  /**
   * Suggest the best agent for a given message
   */
  async suggestAgent(message: string): Promise<AgentType> {
    this.logger.debug({ messageLength: message.length }, 'Suggesting agent for message');
    
    // For now, just return default agent
    // In a real implementation, this would use an LLM to classify the message
    return 'default';
  }
} 