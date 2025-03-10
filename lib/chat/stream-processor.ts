import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Process a stream with validation and storage
 * @param streamResponse The original stream response from AI SDK
 * @param validateFn Function to validate and potentially fix the response
 * @param options Additional options for processing
 */
export async function processStreamWithValidation(
  streamResponse: { toDataStreamResponse: () => Response },
  validateFn: (text: string) => string,
  options?: {
    chatId?: string;
    userId?: string;
    storeInDatabase?: boolean;
  }
) {
  const { chatId, userId, storeInDatabase = true } = options || {};
  
  // Get the original response
  const originalResponse = streamResponse.toDataStreamResponse();
  
  if (!originalResponse.body) {
    throw new Error('Response body is null');
  }
  
  // Create a transformer to collect the full text and apply validation
  class ResponseTransformer {
    fullText: string = '';
    textDecoder: TextDecoder = new TextDecoder();
    
    transform(chunk: Uint8Array, controller: TransformStreamDefaultController) {
      // Pass the chunk through to the client unmodified
      controller.enqueue(chunk);
      
      // Also accumulate it for processing later
      this.fullText += this.textDecoder.decode(chunk, { stream: true });
    }
    
    async flush(controller: TransformStreamDefaultController) {
      try {
        // Apply validation to the full text
        const validatedText = validateFn(this.fullText);
        
        // If validation modified the response, send the difference
        if (validatedText !== this.fullText) {
          edgeLogger.info('Fixed response with validation function', {
            originalLength: this.fullText.length,
            fixedLength: validatedText.length
          });
          
          // Send the difference as a final chunk
          const difference = validatedText.slice(this.fullText.length);
          if (difference) {
            controller.enqueue(new TextEncoder().encode(difference));
          }
        }
        
        // Store in database if needed
        if (storeInDatabase && chatId && userId) {
          try {
            const supabase = await createServerClient();
            await supabase
              .from('sd_chat_messages')
              .insert({
                chat_id: chatId,
                role: 'assistant',
                content: validatedText,
                user_id: userId
              });
            
            edgeLogger.info('Stored assistant response', {
              chatId,
              userId,
              contentLength: validatedText.length
            });
            
            // Add metadata in a special format the client can recognize
            const metadata = {
              validation: validatedText !== this.fullText ? 'modified' : 'unchanged',
              storage: 'success'
            };
            
            // Encode it as a special message the client can parse
            const metadataChunk = `\n\n__METADATA__:${JSON.stringify(metadata)}`;
            controller.enqueue(new TextEncoder().encode(metadataChunk));
          } catch (error) {
            edgeLogger.error('Failed to store assistant response', {
              error,
              chatId,
              userId
            });
            
            // Add error metadata
            const metadata = {
              validation: validatedText !== this.fullText ? 'modified' : 'unchanged',
              storage: 'failed',
              error: String(error)
            };
            
            // Encode it as a special message the client can parse
            const metadataChunk = `\n\n__METADATA__:${JSON.stringify(metadata)}`;
            controller.enqueue(new TextEncoder().encode(metadataChunk));
          }
        }
      } catch (error) {
        edgeLogger.error('Error in stream processing', { error });
      }
    }
  }
  
  const transformer = new ResponseTransformer();
  const transformStream = new TransformStream({
    transform(chunk, controller) {
      transformer.transform(chunk, controller);
    },
    flush(controller) {
      return transformer.flush(controller);
    }
  });
  
  // Pipe the original response through our transform stream
  originalResponse.body.pipeTo(transformStream.writable).catch(error => {
    edgeLogger.error('Error piping stream', { error });
  });
  
  // Return a new response with our processed stream
  return new Response(transformStream.readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
} 