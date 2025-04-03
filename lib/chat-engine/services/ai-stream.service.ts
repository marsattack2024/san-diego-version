import { CoreMessage, Message, StreamTextResult, Tool, ToolCall, ToolResult, streamText, convertToCoreMessages } from 'ai';
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
    constructor() {
        edgeLogger.info('AI Stream Service initialized', {
            category: LOG_CATEGORIES.SYSTEM
        });
    }

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
        config: ChatEngineConfig,
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

            // Add detailed logging for tools configuration
            if (config.tools) {
                const toolNames = Object.keys(config.tools);
                edgeLogger.debug('Tools configuration passed to streamText', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    requestId,
                    toolCount: toolNames.length,
                    toolNames,
                    toolDetails: JSON.stringify(Object.entries(config.tools).map(([name, tool]) => ({
                        name,
                        hasDescription: !!tool.description,
                        hasExecute: !!tool.execute,
                        parametersType: tool.parameters ? typeof tool.parameters : 'none',
                    })))
                });
            } else {
                edgeLogger.warn('No tools passed to streamText', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: operationName,
                    requestId
                });
            }

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

            // Convert standardized messages to CoreMessages before sending to streamText
            const coreMessages = convertToCoreMessages(standardizedMessages);

            edgeLogger.debug('Converted messages to CoreMessage format', {
                category: LOG_CATEGORIES.LLM,
                operation: operationName,
                requestId,
                coreMessageCount: coreMessages.length
            });

            // --- Context Injection Workaround --- 
            // Prepare messages array for AI SDK
            let messagesForSdk: CoreMessage[] = coreMessages;

            // Inject context from config.body into a hidden system message
            if (config.body && Object.keys(config.body).length > 0) {
                const contextMessage: CoreMessage = {
                    role: 'system',
                    content: JSON.stringify(config.body),
                    // Add a custom property or use a convention to identify this message
                    // Note: The SDK might strip unknown properties, using content might be safer
                    // experimental_hidden: true // Example custom property (might be stripped)
                    // We rely on the tool to find and parse this specific message by its structure/content.
                };
                // Prepend context message - less likely to be truncated if history is long
                messagesForSdk = [contextMessage, ...messagesForSdk];

                edgeLogger.debug('Injected context message for tool execution', {
                    category: LOG_CATEGORIES.LLM,
                    operation: operationName,
                    injectedContextKeys: Object.keys(config.body)
                });
            }
            // ----------------------------------

            const result = await streamText({
                model: openai(config.model || 'gpt-4o'),
                messages: messagesForSdk, // Pass the array potentially including the context message
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

                    // Enhanced logging for tool calls
                    if (currentStepToolCalls && currentStepToolCalls.length > 0) {
                        // Log each tool call with detailed information
                        currentStepToolCalls.forEach(call => {
                            edgeLogger.debug('Tool call details', {
                                category: LOG_CATEGORIES.TOOLS,
                                operation: operationName,
                                requestId,
                                toolName: call.toolName,
                                toolCallId: call.toolCallId,
                                argsPreview: JSON.stringify(call.args).substring(0, 200),
                                fullArgs: JSON.stringify(call.args)
                            });
                        });

                        allToolCalls.push(...currentStepToolCalls);
                        edgeLogger.info('AI Stream: Tool calls executed in step', {
                            category: LOG_CATEGORIES.TOOLS,
                            operation: operationName,
                            requestId,
                            toolNames: currentStepToolCalls.map(call => call.toolName)
                        });
                    } else if (finishReason === 'tool-calls') {
                        // Log when finish reason indicates tool calls but none were found
                        edgeLogger.warn('AI Stream: Tool-calls finish reason but no tool calls present', {
                            category: LOG_CATEGORIES.TOOLS,
                            operation: operationName,
                            requestId,
                            finishReason,
                            text: text ? text.substring(0, 100) : 'none'
                        });
                    }

                    // Enhanced logging for tool results
                    if (toolResults && toolResults.length > 0) {
                        edgeLogger.debug('Tool results received', {
                            category: LOG_CATEGORIES.TOOLS,
                            operation: operationName,
                            requestId,
                            toolResultCount: toolResults.length,
                            // Cast toolResults to any to avoid TypeScript errors with unknown structure
                            toolResultsPreview: JSON.stringify((toolResults as any[]).map(result => ({
                                toolCallId: result.toolCallId || 'unknown',
                                contentLength: typeof result.content === 'string' ? result.content.length : 0,
                                contentPreview: typeof result.content === 'string' ? result.content.substring(0, 100) : 'none'
                            })))
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