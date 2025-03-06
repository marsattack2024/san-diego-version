import { validateChatRequest } from '@/lib/chat/validator';
import { chatTools } from '@/lib/chat/tools';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { streamText } from 'ai';
import { Message } from 'ai/react';
import { myProvider } from '@/lib/ai/providers';
import { extractUrls } from '@/lib/chat/url-utils';

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;
export const runtime = 'edge';

// Common base prompt for all interactions
const basePrompt = `You are a helpful AI assistant that provides accurate and concise information.

1. ALWAYS use the getInformation tool first to search the knowledge base before answering.`;

// DeepSearch prioritized prompt
const deepSearchPrioritizedPrompt = `
2. ALWAYS use the deepSearch tool to gather comprehensive research on the topic.

3. ALWAYS check for URLs in the user's message:
   - If the user's message contains URLs or domain-like text, use the comprehensiveScraper tool to extract content
   - The comprehensiveScraper tool extracts all text in a structured format (headers, paragraphs, lists, etc.)
   - When users ask about contact information, phone numbers, addresses, or other specific details from a website, pay special attention to the "Contact Information" section in the scraped content
   - For phone numbers, also look specifically in the "PHONE NUMBERS FOUND" section which contains automatically extracted phone numbers
   - You'll receive a message indicating "Scraped content from [URL]" - use this information to inform your response`;

// Standard tools prompt (without deepSearch)
const standardToolsPrompt = `
2. ALWAYS check for URLs in the user's message:
   - If the user's message contains URLs or domain-like text, use the comprehensiveScraper tool to extract content
   - The comprehensiveScraper tool extracts all text in a structured format (headers, paragraphs, lists, etc.)
   - When users ask about contact information, phone numbers, addresses, or other specific details from a website, pay special attention to the "Contact Information" section in the scraped content
   - For phone numbers, also look specifically in the "PHONE NUMBERS FOUND" section which contains automatically extracted phone numbers
   - You'll receive a message indicating "Scraped content from [URL]" - use this information to inform your response

3. If the knowledge base doesn't have relevant information and no URLs are found, provide a response based on your training`;

// Common ending for both prompts
const commonEndingPrompt = `
If relevant information is found, incorporate it into your response naturally without explicitly mentioning that you're using a knowledge base or retrieved documents. Do not say phrases like "According to the knowledge base" or "Based on the information I found".

Keep responses concise and focused.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, id, deepSearchEnabled = false } = validateChatRequest(body);
    const modelName = 'gpt-4o'; // Fixed model set by backend

    edgeLogger.info('Processing chat request', { 
      messageCount: messages.length, 
      modelName,
      chatId: id,
      deepSearchEnabled
    });

    // Get the latest user message
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const latestUserMessage = latestMessage && latestMessage.role === 'user' ? latestMessage.content : '';
    
    // Check if the message might contain URLs
    const mightContainUrls = latestUserMessage && extractUrls(latestUserMessage as string).length > 0;
    
    if (mightContainUrls) {
      edgeLogger.info('Message might contain URLs, will instruct model to use URL detection tools', {
        messagePreview: (latestUserMessage as string).substring(0, 100)
      });
    }

    // Construct the system prompt based on whether deepSearch is enabled
    const systemPrompt = `${basePrompt}${deepSearchEnabled ? deepSearchPrioritizedPrompt : standardToolsPrompt}${commonEndingPrompt}`;
    
    // Convert OpenAI message types to AI SDK message types
    const convertedMessages: Message[] = messages.map((msg: any) => ({
      id: msg.id || String(Math.random()),
      role: msg.role === 'tool' ? 'assistant' : msg.role,
      content: msg.content || ''
    }));

    // Filter tools based on deepSearchEnabled flag
    const availableTools = deepSearchEnabled 
      ? chatTools 
      : Object.fromEntries(
          Object.entries(chatTools).filter(([key]) => key !== 'deepSearch')
        );
    
    // Determine the appropriate max steps based on the presence of URLs and deepSearch
    let maxSteps = 3; // Default
    if (deepSearchEnabled) maxSteps = 5; // More steps for deep search
    if (mightContainUrls) maxSteps = 5; // More steps for URL scraping
    
    // Use direct streamText approach with maxSteps for tool calls
    const result = streamText({
      model: myProvider.languageModel(modelName),
      system: systemPrompt,
      messages: convertedMessages,
      temperature: 0.7,
      tools: availableTools,
      maxSteps,
      onFinish: async ({ response }) => {
        // Log completion of request
        edgeLogger.info('Chat request completed', {
          messageCount: response.messages.length,
          modelName,
          chatId: id,
          deepSearchEnabled
        });
      }
    });

    // Return the direct stream response
    return result.toDataStreamResponse();
  } catch (error) {
    edgeLogger.error('Error processing chat request', { error });
    return new Response(
      JSON.stringify({
        error: 'There was an error processing your request',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}