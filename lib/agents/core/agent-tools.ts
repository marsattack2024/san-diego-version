import { z } from 'zod';
import { AgentTool } from './agent-types';
import { clientLogger } from '../../logger/client-logger';

// Create a logger with the agent:tools prefix
const logger = {
  debug: (message: string, data?: any) => clientLogger.debug(`agent:tools - ${message}`, data),
  info: (message: string, data?: any) => clientLogger.info(`agent:tools - ${message}`, data),
  warn: (message: string, data?: any) => clientLogger.warn(`agent:tools - ${message}`, data),
  error: (message: string | Error, data?: any) => clientLogger.error(
    message instanceof Error ? `agent:tools - ${message.message}` : `agent:tools - ${message}`,
    { ...data, stack: message instanceof Error ? message.stack : undefined }
  )
};

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
      
      logger.debug(`Executing tool ${name}`, {
        tool: name,
        params
      });
      
      try {
        const result = await executeFn(params);
        const endTime = performance.now();
        
        logger.debug(`Tool ${name} executed successfully`, {
          tool: name,
          executionTimeMs: Math.round(endTime - startTime)
        });
        
        return result;
      } catch (error) {
        const endTime = performance.now();
        
        logger.error(`Error executing tool ${name}`, {
          tool: name,
          error: error instanceof Error ? error : new Error(String(error)),
          executionTimeMs: Math.round(endTime - startTime)
        });
        
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