import {
  streamText,
  type Message,
} from 'ai';
import { validateChatRequest } from '@/lib/chat/validator';
import { chatTools } from '@/lib/chat/tools';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { myProvider } from '@/lib/ai/providers';

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;

export const runtime = 'edge';

const systemPrompt = `You are a helpful AI assistant with access to a knowledge base. 

When asked a question, you will ALWAYS use the getInformation tool to search the knowledge base before answering. 

If relevant information is found, incorporate it into your response naturally without explicitly mentioning that you're using a knowledge base or retrieved documents. Do not say phrases like "According to the knowledge base" or "Based on the information I found".

If no relevant information is found, provide a general response based on your training.

Keep responses concise and focused.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, id } = validateChatRequest(body);
    const modelName = 'gpt-4o'; // Fixed model set by backend

    edgeLogger.info('Processing chat request', { 
      messageCount: messages.length, 
      modelName,
      chatId: id
    });

    // Convert OpenAI message types to AI SDK message types
    const convertedMessages: Message[] = messages.map((msg: any) => ({
      id: msg.id || String(Math.random()),
      role: msg.role === 'tool' ? 'assistant' : msg.role,
      content: msg.content || ''
    }));

    // Use direct streamText approach with maxSteps for tool calls
    const result = streamText({
      model: myProvider.languageModel(modelName),
      system: systemPrompt,
      messages: convertedMessages,
      temperature: 0.7,
      tools: chatTools,
      maxSteps: 3, // Enable multi-step tool calls and responses
      onFinish: async ({ response }) => {
        // Log completion of request
        edgeLogger.info('Chat request completed', {
          messageCount: response.messages.length,
          modelName,
          chatId: id
        });
      }
    });

    // Return the direct stream response
    return result.toDataStreamResponse();
  } catch (error) {
    edgeLogger.error('Chat request failed', { error });

    return new Response(
      JSON.stringify({
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}