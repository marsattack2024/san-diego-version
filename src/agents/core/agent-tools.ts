import { z } from 'zod';
import { AgentTool } from './agent-types';
import { createLogger } from '../../utils/client-logger';

const logger = createLogger('agent:tools');

/**
 * Create a basic tool that logs its usage
 */
export function createBasicTool<T extends z.ZodType<any, any>>(
  name: string,
  description: string,
  schema: T,
  executeFn: (params: z.infer<T>) => Promise<any>
): AgentTool {
  return {
    name,
    description,
    schema,
    execute: async (params: z.infer<T>) => {
      const startTime = performance.now();
      
      logger.debug({
        tool: name,
        params
      }, `Executing tool ${name}`);
      
      try {
        const result = await executeFn(params);
        const endTime = performance.now();
        
        logger.debug({
          tool: name,
          executionTimeMs: Math.round(endTime - startTime)
        }, `Tool ${name} executed successfully`);
        
        return result;
      } catch (error) {
        const endTime = performance.now();
        
        logger.error({
          tool: name,
          error,
          executionTimeMs: Math.round(endTime - startTime)
        }, `Error executing tool ${name}`);
        
        throw error;
      }
    }
  };
}

/**
 * Echo tool for testing purposes
 */
export const echoTool: AgentTool = createBasicTool(
  'echo',
  'Echoes back the input message',
  z.object({
    message: z.string().describe('The message to echo back')
  }),
  async ({ message }) => {
    return { message };
  }
);

/**
 * Current date/time tool
 */
export const dateTimeTool: AgentTool = createBasicTool(
  'dateTime',
  'Get the current date and time',
  z.object({
    timezone: z.string().optional().describe('Timezone to use (default: UTC)')
  }),
  async ({ timezone = 'UTC' }) => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      formatted: now.toLocaleString('en-US', { timeZone: timezone }),
      timezone
    };
  }
); 