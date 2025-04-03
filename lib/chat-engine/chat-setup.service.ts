/**
 * Chat Setup Service
 * 
 * Responsibility: Determine the full ChatEngineConfig based on request parameters 
 * and context (e.g., main chat vs. widget). Encapsulates agent routing, 
 * tool configuration, flag parsing, prompt generation, and other setup logic.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { prompts } from '@/lib/chat-engine/prompts';
import { detectAgentType, getAgentConfig } from '@/lib/chat-engine/agent-router';
import { createToolSet, widgetTools } from '@/lib/tools/registry.tool';
import { parseBooleanValue } from '@/lib/utils/misc-utils';
import type { AgentType } from '@/lib/chat-engine/prompts';
import type { ChatEngineConfig } from './chat-engine.config';
import type { Message } from 'ai';
import { AgentOrchestrator } from './services/orchestrator.service';
import { OrchestratedResponse, OrchestratorResult } from './types/orchestrator';

interface ChatSetupInput {
    requestBody: Record<string, any>; // Parsed request body
    userId?: string; // Authenticated user ID
    isWidget: boolean; // Flag to distinguish context
}

export class ChatSetupService {
    private operationId: string;
    private agentOrchestrator: AgentOrchestrator;

    constructor() {
        // Generate a unique ID for logging within this service instance
        this.operationId = `setup_${Math.random().toString(36).substring(2, 10)}`;
        this.agentOrchestrator = new AgentOrchestrator();
        edgeLogger.debug('ChatSetupService initialized', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId: this.operationId
        });
    }

    /**
     * Prepares the full ChatEngineConfig based on the input request and context.
     * @param input - Contains request body, user ID, and context flag.
     * @returns A promise resolving to either ChatEngineConfig (single agent) or OrchestratedResponse.
     */
    async prepareConfig(input: ChatSetupInput): Promise<ChatEngineConfig | OrchestratedResponse> {
        const { requestBody, userId, isWidget } = input;
        const setupStartTime = Date.now();

        edgeLogger.info('Starting chat engine configuration setup', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId: this.operationId,
            isWidget,
            userIdProvided: !!userId,
            bodyKeys: Object.keys(requestBody).join(', ')
        });

        // 1. Extract Flags and Basic Info
        const deepSearchEnabled = parseBooleanValue(requestBody.deepSearchEnabled);
        const requestedAgentId = requestBody.agentId || 'default';
        const sessionId = requestBody.id || requestBody.sessionId;
        const disableMessagePersistence = parseBooleanValue(requestBody.disable_persistence);
        const useOrchestratorFlag = parseBooleanValue(requestBody.useOrchestrator);

        // Extract last user message content for agent detection
        let lastUserMessageContent: string = '';
        if (requestBody.messages && Array.isArray(requestBody.messages) && requestBody.messages.length > 0) {
            const lastMessage = requestBody.messages[requestBody.messages.length - 1];
            if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
                lastUserMessageContent = lastMessage.content;
            }
        } else if (requestBody.message && typeof requestBody.message.content === 'string') {
            // Handle the single message format
            lastUserMessageContent = requestBody.message.content;
        }

        edgeLogger.debug('Extracted flags and info', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId: this.operationId,
            deepSearchEnabled,
            requestedAgentId,
            sessionId: sessionId?.substring(0, 8),
            disableMessagePersistence,
            useOrchestratorFlag,
            messageContentPreview: lastUserMessageContent.substring(0, 50) + '...'
        });

        // --- Orchestration Decision Point --- 
        // Prevent orchestration for widget requests, regardless of the flag
        const shouldOrchestrate = useOrchestratorFlag && !isWidget;

        if (shouldOrchestrate) {
            // Orchestration logic here
        }

        // 2. Determine Agent Type and Config
        let agentType: AgentType = 'default'; // Default agent type
        let agentConfig = getAgentConfig('default'); // Start with default config
        let shouldUseDeepSearch = false;

        if (isWidget) {
            // Widget specific configuration
            // Keep agentType as 'default' for type consistency, but override config
            agentConfig = {
                ...agentConfig, // Start with default agent config
                model: 'gpt-4o-mini', // Override model
                temperature: 0.4, // Override temperature
                toolOptions: { // Explicitly define widget tool capabilities
                    useKnowledgeBase: true,
                    useWebScraper: false, // Disable scraper for widget
                    useDeepSearch: false, // Disable deep search for widget
                    useRagTool: true, // Ensure RAG is enabled
                    useProfileContext: false // Explicitly disable profile context for widget
                }
            };
            shouldUseDeepSearch = false; // Explicitly false for widget
            edgeLogger.info('Applying fixed widget configuration overrides', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId: this.operationId,
                finalAgentType: agentType, // Log the underlying agent type ('default')
                widgetModel: agentConfig.model
            });
        } else {
            // Main chat agent routing
            try {
                const detectionResult = await detectAgentType(
                    lastUserMessageContent,
                    requestedAgentId
                );
                agentType = detectionResult.agentType;
                agentConfig = detectionResult.config;
                edgeLogger.info('Agent detected for main chat', {
                    category: LOG_CATEGORIES.CHAT,
                    operationId: this.operationId,
                    detectedAgent: agentType,
                    reasoning: detectionResult.reasoning
                });
            } catch (error) {
                edgeLogger.error('Agent detection failed, falling back to default', {
                    category: LOG_CATEGORIES.CHAT,
                    operationId: this.operationId,
                    error: error instanceof Error ? error.message : String(error),
                    fallbackAgent: 'default'
                });
                // Keep default agentType and agentConfig
            }

            // Determine final deep search status for main chat
            const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;
            shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;
            edgeLogger.info('Deep Search determination', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId: this.operationId,
                agentSupports: canAgentUseDeepSearch,
                userEnabled: deepSearchEnabled,
                finalDecision: shouldUseDeepSearch
            });
        }

        // 3. Configure Tool Set
        let tools: ChatEngineConfig['tools'] = {};
        if (isWidget) {
            tools = widgetTools; // Use the fixed, minimal toolset for widget
            edgeLogger.info('Using fixed widget toolset', {
                category: LOG_CATEGORIES.TOOLS,
                operationId: this.operationId,
                toolCount: Object.keys(tools).length,
                toolNames: Object.keys(tools).join(', ')
            });
        } else {
            // Dynamically create toolset for main chat
            tools = createToolSet({
                useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
                useWebScraper: agentConfig.toolOptions.useWebScraper,
                useDeepSearch: shouldUseDeepSearch, // Use the final calculated value
                useProfileContext: agentConfig.toolOptions.useProfileContext // Pass the flag
            });
            edgeLogger.info('Created dynamic toolset for main chat', {
                category: LOG_CATEGORIES.TOOLS,
                operationId: this.operationId,
                toolCount: Object.keys(tools).length,
                toolNames: Object.keys(tools).join(', ')
            });
        }

        // 4. Generate System Prompt
        const systemPrompt = prompts.buildSystemPrompt(agentType, shouldUseDeepSearch);

        // 5. Determine Auth and Persistence
        const requiresAuth = !isWidget;
        const finalMessagePersistenceDisabled = isWidget || disableMessagePersistence;

        // 6. Assemble Final ChatEngineConfig
        const engineConfig: ChatEngineConfig = {
            // Core settings determined by context/agent
            agentType,
            tools,
            systemPrompt,
            model: agentConfig.model || 'gpt-4o',
            temperature: agentConfig.temperature || 0.7,
            // Flags determined by context/request
            requiresAuth,
            messagePersistenceDisabled: finalMessagePersistenceDisabled,
            corsEnabled: isWidget, // Enable CORS only for widget
            useDeepSearch: shouldUseDeepSearch, // Pass final decision
            useWebScraper: agentConfig.toolOptions.useWebScraper && !isWidget, // Also needs context
            // Standard operational settings
            operationName: isWidget ? `widget_chat_${this.operationId}` : `chat_${agentType}`,
            cacheEnabled: true,
            messageHistoryLimit: isWidget ? 20 : 50,
            maxTokens: isWidget ? 800 : 16000, // Example: smaller limit for widget
            // Body for tool context/flags
            body: {
                // **Critical:** Pass all flags tools might need
                deepSearchEnabled: shouldUseDeepSearch,
                sessionId,
                userId, // Ensure userId is passed
                agentType,
                isWidgetChat: isWidget,
                bypassAuth: !requiresAuth // Pass auth bypass status if needed downstream
                // Add any other flags needed by specific tools here
            }
        };

        edgeLogger.info('Chat engine configuration prepared', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId: this.operationId,
            durationMs: Date.now() - setupStartTime,
            finalConfig: {
                agentType: engineConfig.agentType,
                model: engineConfig.model,
                requiresAuth: engineConfig.requiresAuth,
                persistenceDisabled: engineConfig.messagePersistenceDisabled,
                useDeepSearch: engineConfig.useDeepSearch,
                toolCount: Object.keys(engineConfig.tools || {}).length
            }
        });

        return engineConfig;
    }
} 