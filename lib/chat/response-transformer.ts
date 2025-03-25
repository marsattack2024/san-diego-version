import { createClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

/**
 * Options for the ResponseTransformer
 */
interface ResponseTransformerOptions {
  chatId: string;
  userId: string;
  toolsUsed: string[];
}

/**
 * Transforms a stream of text chunks by accumulating the full text,
 * validating it, and saving to the database.
 */
export class ResponseTransformer extends TransformStream<Uint8Array, Uint8Array> {
  constructor(
    validateFn: (text: string) => string,
    options: ResponseTransformerOptions
  ) {
    let fullText = '';
    const textDecoder = new TextDecoder();
    const textEncoder = new TextEncoder();
    
    super({
      transform(chunk, controller) {
        try {
          // Decode the chunk and accumulate text
          const decodedChunk = textDecoder.decode(chunk, { stream: true });
          fullText += decodedChunk;
          
          // Pass through the chunk unmodified to allow streaming
          controller.enqueue(chunk);
        } catch (error) {
          edgeLogger.error('Error transforming chunk', { error });
          controller.error(error);
        }
      },
      
      async flush(controller) {
        try {
          // Make sure we decode any remaining bytes
          fullText += textDecoder.decode();
          
          // Validate the full text
          const validatedText = validateFn(fullText);
          
          // Log validation results
          const wasModified = validatedText !== fullText;
          edgeLogger.info(wasModified ? 'Fixed response with validation function' : 'Response validation completed', {
            originalLength: fullText.length,
            fixedLength: validatedText.length,
            wasModified
          });
          
          // If the validation modified the text, we need to add the difference as a final chunk
          if (wasModified && validatedText.length > fullText.length) {
            // Get the appended text (what was added to the end)
            const appendedText = validatedText.slice(fullText.length);
            
            // Send the difference as a final chunk
            controller.enqueue(textEncoder.encode(appendedText));
          }
          
          // Don't store in database - client side handles this
          // This prevents duplicate message entries
          
          // Log that we're delegating storage to the client
          if (options.userId && options.chatId) {
            edgeLogger.debug('Skipping server-side message storage (delegated to client)', {
              chatId: options.chatId,
              contentLength: validatedText.length,
              reason: 'Prevents duplicate entries'
            });
          }
        } catch (error) {
          edgeLogger.error('Error in response transformer flush', { error });
        }
      }
    });
  }
} 