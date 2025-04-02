import { CoreMessage, Message, StreamTextResult, Tool, ToolCall, ToolResult, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ChatEngineContext } from '@/lib/chat-engine/types';
import { ChatEngineConfig } from '../chat-engine.config';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createClient } from '@/utils/supabase/server'; // Needed for title generation check temporarily
import { chatLogger } from '@/lib/logger/chat-logger'; // Needed for requestCompleted logging

// Define the shape of the callbacks we'll accept
// These will be provided by the facade later
interface AIServiceCallbacks {
    // Called when stream finishes, providing final text and collected tool usage
    onStreamFinish: (args: {
        text: string,
        toolCalls?: ToolCall<string, any>[], // Use generic ToolCall
        usage: { completionTokens: number; promptTokens: number; totalTokens: number; },
        response?: any // Raw model response 
    }) => Promise<void>;

    // Placeholder for potentially needed step finish logic
    // onStreamStepFinish?: (args: { text?: string; toolCalls?: ToolCall<string, any>[]; toolResults?: ToolResult[]; finishReason: string; usage: ... }) => void;
}

/**
 * Service responsible for interacting with the AI model stream (Vercel AI SDK).
 */
export class AIStreamService {

    // Phase 8: Inject dependencies like logger, config subsets
    constructor() { }

    /**
     * Processes the chat request using the Vercel AI SDK's streamText.
     *
     * @param context - The operational context for the request.
     * @param config - Relevant configuration for the AI call (model, tools, temp, etc.).
     * @param callbacks - Callbacks to be invoked on stream events (e.g., onFinish).
     * @returns A Promise resolving to the Response object from streamText.
     */
    async process(
        context: ChatEngineContext,
        config: Pick<ChatEngineConfig, 'model' | 'systemPrompt' | 'tools' | 'temperature' | 'maxTokens' | 'body' | 'operationName'>,
        callbacks: AIServiceCallbacks
    ): Promise<Response> {
        const operationName = config.operationName || 'ai_stream_process';
        const requestId = context.requestId; // Use context's requestId
        const userId = context.userId;
        const logUserId = userId ? maskUserId(userId) : 'anonymous'; // Use helper

        try {
            edgeLogger.debug('Starting AI stream processing', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId,
                userId: logUserId,
                model: config.model,
                hasTools: !!config.tools && Object.keys(config.tools).length > 0,
                temperature: config.temperature,
                maxTokens: config.maxTokens
            });

            // Get combined messages from context
            const allMessages = [
                ...(context.previousMessages || []),
                ...context.messages
            ];

            // Additional validation to ensure every message meets AI SDK requirements
            const validatedMessages = allMessages.filter(msg => {
                // Check if message is a valid object
                if (!msg || typeof msg !== 'object') {
                    edgeLogger.error('Removing invalid message object', {
                        category: LOG_CATEGORIES.LLM,
                        operation: operationName,
                        requestId,
                        msgType: typeof msg
                    });
                    return false;
                }

                // Check for valid role property
                if (!msg.role || !['user', 'assistant', 'system', 'tool', 'function'].includes(msg.role)) {
                    edgeLogger.error('Removing message with invalid role', {
                        category: LOG_CATEGORIES.LLM,
                        operation: operationName,
                        requestId,
                        role: msg.role
                    });
                    return false;
                }

                // Check for content property
                if (msg.content === undefined || msg.content === null) {
                    // Check if there are parts with text
                    if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
                        const textPart = msg.parts.find((part: any) =>
                            part && part.type === 'text' && 'text' in part && typeof part.text === 'string');

                        if (textPart && 'text' in textPart && textPart.text) {
                            // Create a new message object with content from parts
                            const fixedMsg = {
                                ...msg,
                                content: textPart.text
                            };

                            edgeLogger.debug('AI Stream: Extracted content from parts array', {
                                category: LOG_CATEGORIES.LLM,
                                operation: operationName,
                                requestId,
                                role: msg.role,
                                contentLength: fixedMsg.content.length
                            });

                            // Return the fixed message instead of filtering out
                            return fixedMsg;
                        }
                    }

                    edgeLogger.error('Removing message with missing content', {
                        category: LOG_CATEGORIES.LLM,
                        operation: operationName,
                        requestId,
                        role: msg.role
                    });
                    return false;
                }

                // For user/assistant/system messages, content must be a string
                if (['user', 'assistant', 'system'].includes(msg.role) && typeof msg.content !== 'string') {
                    edgeLogger.error('Removing message with non-string content', {
                        category: LOG_CATEGORIES.LLM,
                        operation: operationName,
                        requestId,
                        role: msg.role,
                        contentType: typeof msg.content
                    });
                    return false;
                }

                return true;
            });

            // Log validation results
            if (validatedMessages.length < allMessages.length) {
                edgeLogger.warn('Some messages were filtered during validation', {
                    category: LOG_CATEGORIES.LLM,
                    operation: operationName,
                    requestId,
                    originalCount: allMessages.length,
                    validatedCount: validatedMessages.length,
                    removed: allMessages.length - validatedMessages.length
                });
            }

            // Safety check - if all messages were filtered out, add a default user message
            if (validatedMessages.length === 0) {
                edgeLogger.error('All messages were invalid, adding default message', {
                    category: LOG_CATEGORIES.LLM,
                    operation: operationName,
                    requestId,
                    important: true
                });

                validatedMessages.push({
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: 'Hello'
                });
            }

            // Detailed log of the messages about to be processed
            edgeLogger.debug('Processing validated messages for AI stream', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId,
                messageCount: validatedMessages.length,
                roles: validatedMessages.map(m => m.role),
                firstMessage: validatedMessages.length > 0 ?
                    JSON.stringify({
                        id: validatedMessages[0].id,
                        role: validatedMessages[0].role,
                        content: typeof validatedMessages[0].content === 'string' ?
                            validatedMessages[0].content.substring(0, 50) :
                            '[Object content]'
                    }) : 'none'
            });

            const systemPromptBase = config.systemPrompt || 'You are a helpful AI assistant.';
            // Include feature flags in system prompt
            const dsEnabled = config.body?.deepSearchEnabled ? 'deepSearchEnabled' : 'deepSearchDisabled';
            const systemContent = `${systemPromptBase}\n\n### FEATURE FLAGS:\n${dsEnabled}\n\n### REMINDER: USE MARKDOWN FORMATTING\nUse proper markdown syntax for all responses including lists, headings, code blocks, bold text, and tables as specified in the Formatting Instructions.`;

            // --- Invoke streamText --- 
            const allToolCalls: ToolCall<string, any>[] = []; // Use generic ToolCall

            const result = await streamText({
                model: openai(config.model || 'gpt-4o'),
                messages: validatedMessages as any, // Cast to any to bypass type check
                system: systemContent, // Pass system prompt here
                tools: config.tools,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
                maxSteps: 5,
                toolChoice: 'auto',
                onStepFinish({ text, toolCalls: currentStepToolCalls, toolResults, finishReason, usage }) {
                    edgeLogger.debug('AI Stream: Step completed', {
                        category: LOG_CATEGORIES.LLM,
                        operation: operationName,
                        requestId,
                        hasText: !!text && text.length > 0,
                        toolCallCount: currentStepToolCalls?.length || 0,
                        toolResultCount: toolResults?.length || 0,
                        finishReason,
                        usage
                    });

                    if (currentStepToolCalls && currentStepToolCalls.length > 0) {
                        allToolCalls.push(...currentStepToolCalls);
                        edgeLogger.info('AI Stream: Tool calls executed in step', {
                            category: LOG_CATEGORIES.TOOLS,
                            operation: operationName,
                            requestId,
                            toolNames: currentStepToolCalls.map(call => call.toolName)
                        });
                    }
                    // Optional: Call callbacks.onStreamStepFinish if provided
                },
                async onFinish({ text, response, usage }) {
                    edgeLogger.info('AI Stream: Finished', {
                        category: LOG_CATEGORIES.LLM,
                        operation: operationName,
                        requestId,
                        textLength: text?.length || 0,
                        usage,
                        finalToolCallCount: allToolCalls.length
                    });

                    // Call the provided onFinish callback with processed data
                    if (callbacks.onStreamFinish) {
                        await callbacks.onStreamFinish({
                            text: text || '', // Ensure text is not undefined
                            toolCalls: allToolCalls, // Pass collected tool calls
                            usage: usage || { completionTokens: 0, promptTokens: 0, totalTokens: 0 }, // Provide default usage
                            response // Pass raw response if needed
                        });
                    } else {
                        edgeLogger.warn('AI Stream: onFinish callback not provided!', {
                            category: LOG_CATEGORIES.SYSTEM,
                            operation: operationName,
                            requestId
                        });
                    }

                    // REMOVED: Persistence and Title Generation logic - handled by facade via callback
                }
            });

            // Consume the stream in the background (important for callbacks)
            result.consumeStream();
            edgeLogger.debug('AI Stream: Background consumption enabled', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId
            });

            const streamResponse = result.toDataStreamResponse();

            edgeLogger.info('AI stream processing complete, returning response', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId,
                durationMs: Date.now() - context.startTime // Approximate duration for stream part
            });

            return streamResponse;

        } catch (error) {
            edgeLogger.error('Error during AI stream processing', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId,
                error: error instanceof Error ? error.message : String(error),
                important: true
            });
            // Re-throw to be handled by the calling facade/route handler
            // Consider wrapping in a standardized error Response
            throw error;
        }
    }
}

// Helper function (should be imported from misc-utils)
function maskUserId(userId: string): string {
    return userId ? userId.substring(0, 5) + '...' + userId.substring(userId.length - 4) : 'anonymous';
} 