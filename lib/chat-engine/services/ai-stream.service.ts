import { CoreMessage, Message, StreamTextResult, Tool, ToolCall, ToolResult, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ChatEngineContext } from '@/lib/chat-engine/types';
import { ChatEngineConfig } from '../chat-engine.config';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { standardizeMessages } from '../utils/message-utils';
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

            // Use standardizeMessages utility to ensure all messages meet AI SDK requirements
            const standardizedMessages = standardizeMessages(allMessages, {
                operationId: requestId,
                validateRole: true
            });

            // Log validation results
            if (standardizedMessages.length < allMessages.length) {
                edgeLogger.warn('Some messages were filtered during standardization', {
                    category: LOG_CATEGORIES.LLM,
                    operation: operationName,
                    requestId,
                    originalCount: allMessages.length,
                    standardizedCount: standardizedMessages.length,
                    removed: allMessages.length - standardizedMessages.length
                });
            }

            // Safety check - if all messages were filtered out, add a default user message
            if (standardizedMessages.length === 0) {
                edgeLogger.error('All messages were invalid, adding default message', {
                    category: LOG_CATEGORIES.LLM,
                    operation: operationName,
                    requestId,
                    important: true
                });

                standardizedMessages.push({
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: 'Hello',
                    createdAt: new Date()
                });
            }

            // Detailed log of the messages about to be processed
            edgeLogger.debug('Processing standardized messages for AI stream', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId,
                messageCount: standardizedMessages.length,
                roles: standardizedMessages.map(m => m.role),
                firstMessage: standardizedMessages.length > 0 ?
                    JSON.stringify({
                        id: standardizedMessages[0].id,
                        role: standardizedMessages[0].role,
                        content: typeof standardizedMessages[0].content === 'string' ?
                            standardizedMessages[0].content.substring(0, 50) :
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
                messages: standardizedMessages, // Now using standardized messages
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