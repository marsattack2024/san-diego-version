import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { 
  Agent, 
  AgentContext, 
  AgentMessage, 
  AgentResponse, 
  AgentTool, 
  AgentType,
  createAgentMessage
} from './agent-types';
import { createAgentLogger } from './agent-logger';

/**
 * Base agent class that implements common functionality for all agents
 */
export abstract class BaseAgent implements Agent {
  abstract id: AgentType;
  abstract name: string;
  abstract description: string;
  abstract capabilities: string[];
  abstract icon: string;
  abstract systemPrompt: string;
  abstract tools: AgentTool[];
  
  /**
   * Process a message using this agent
   */
  async processMessage(
    message: string, 
    context: AgentContext
  ): Promise<AgentResponse> {
    const logger = createAgentLogger(this.id, {
      sessionId: context.sessionId,
      conversationId: context.conversationId
    });
    
    const startTime = performance.now();
    
    logger.info({
      action: 'process_message_start',
      messageLength: message.length
    }, `Processing message with ${this.name}`);
    
    // Create user message and add to context
    const userMessage = createAgentMessage('user', message);
    context.history.push(userMessage);
    
    try {
      // Convert agent tools to AI SDK tools format
      const aiTools = this.tools.reduce((acc, t) => {
        acc[t.name] = tool({
          description: t.description,
          parameters: t.schema,
          execute: async (params) => {
            logger.debug({
              tool: t.name,
              params
            }, `Executing tool ${t.name}`);
            
            const toolStartTime = performance.now();
            try {
              const result = await t.execute(params);
              const toolEndTime = performance.now();
              
              logger.debug({
                tool: t.name,
                executionTimeMs: Math.round(toolEndTime - toolStartTime)
              }, `Tool ${t.name} executed successfully`);
              
              return result;
            } catch (error) {
              logger.error({
                tool: t.name,
                error
              }, `Error executing tool ${t.name}`);
              throw error;
            }
          }
        });
        return acc;
      }, {} as Record<string, any>);
      
      // Generate response using AI SDK
      const { text, toolCalls, usage } = await generateText({
        model: openai('gpt-4o'),
        system: this.systemPrompt,
        prompt: this.formatPrompt(context),
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5
      });
      
      // Create assistant message
      const assistantMessage = createAgentMessage('assistant', text, { toolCalls });
      
      // Add assistant message to context
      context.history.push(assistantMessage);
      
      const endTime = performance.now();
      const processingTimeMs = Math.round(endTime - startTime);
      
      logger.info({
        action: 'process_message_complete',
        processingTimeMs,
        toolCallCount: toolCalls?.length || 0,
        responseLength: text.length,
        usage
      }, `Completed processing message with ${this.name}`);
      
      return {
        message: assistantMessage,
        toolCalls,
        usage,
        processingTimeMs
      };
    } catch (error) {
      const endTime = performance.now();
      const processingTimeMs = Math.round(endTime - startTime);
      
      logger.error({
        action: 'process_message_error',
        error,
        processingTimeMs
      }, `Error processing message with ${this.name}`);
      
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
        processingTimeMs
      };
    }
  }
  
  /**
   * Format the prompt for the AI model based on conversation history
   */
  protected formatPrompt(context: AgentContext): string {
    // Format conversation history for the prompt
    const formattedHistory = context.history
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
    
    // Preserve line breaks in the formatted history
    return formattedHistory;
  }
} 