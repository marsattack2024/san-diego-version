import { z } from 'zod';
import { edgeLogger } from '@/lib/logger/edge-logger';

/**
 * Type guard validation helper - simpler approach for basic validations
 * 
 * @param input Data to validate
 * @param validator Validation function that returns boolean
 * @param errorMessage Error message to throw/return
 * @param throwError Whether to throw an error or return a result object
 * @returns Result object with success flag and error message if validation fails
 */
export function validateInput<T>(
  input: unknown, 
  validator: (data: unknown) => data is T,
  errorMessage: string = 'Invalid input data',
  throwError: boolean = false
): { success: boolean; data?: T; error?: string } {
  try {
    if (validator(input)) {
      return { success: true, data: input };
    } else {
      if (throwError) {
        throw new Error(errorMessage);
      }
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    edgeLogger.error(`Validation error: ${message}`, { 
      input: typeof input === 'object' ? '(object)' : input 
    });
    
    if (throwError) {
      throw error;
    }
    return { success: false, error: message };
  }
}

/**
 * Zod validation helper - more powerful approach for complex validations
 * 
 * @param input Data to validate
 * @param schema Zod schema to validate against
 * @param errorMessage Custom error message prefix
 * @param throwError Whether to throw an error or return a result object
 * @returns Result object with success flag and validated data or error details
 */
export function validateWithZod<T extends z.ZodType>(
  input: unknown,
  schema: T,
  errorMessage: string = 'Validation failed',
  throwError: boolean = false
): { success: boolean; data?: z.infer<T>; error?: string; errors?: z.ZodError } {
  const result = schema.safeParse(input);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const error = `${errorMessage}: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    
    edgeLogger.error(`Zod validation error`, { 
      error,
      errors: result.error.format(),
      input: typeof input === 'object' ? '(object)' : input
    });
    
    if (throwError) {
      throw new Error(error);
    }
    
    return { 
      success: false, 
      error, 
      errors: result.error 
    };
  }
}

/**
 * Common validation schemas that can be reused across the application
 */
export const CommonSchemas = {
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  uuid: z.string().uuid('Invalid UUID format'),
  url: z.string().url('Invalid URL format'),
  nonEmptyString: z.string().min(1, 'Field cannot be empty'),
  positiveNumber: z.number().positive('Must be a positive number'),
  
  // Auth schemas
  loginSchema: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters')
  }),
  
  // Example usage:
  // const userSchema = z.object({
  //   name: CommonSchemas.nonEmptyString,
  //   email: CommonSchemas.email,
  //   id: CommonSchemas.uuid
  // });
} 