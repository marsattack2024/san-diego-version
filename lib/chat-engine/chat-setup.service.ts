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
     * Determines configuration. Always uses orchestrator for non-widgets.
     * @returns A promise resolving to OrchestratedResponse (main chat) or ChatEngineConfig (widget).
     */
    async prepareConfig(input: ChatSetupInput): Promise<ChatEngineConfig | OrchestratedResponse> {
        const { requestBody, userId, isWidget } = input;
        const setupStartTime = Date.now();

        edgeLogger.info('Starting chat engine setup', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId: this.operationId,
            isWidget,
            userIdProvided: !!userId,
        });

        // --- Handle Widget Path (Simple, Single-Agent) --- 
        if (isWidget) {
            edgeLogger.info('Processing widget request: Using single-agent config.', { category: LOG_CATEGORIES.SYSTEM, operationId: this.operationId });
            // Simplified widget config - directly return ChatEngineConfig
            const widgetAgentConfig = getAgentConfig('default'); // Use default config as base
            const widgetConfig: ChatEngineConfig = {
                agentType: 'default',
                tools: widgetTools,
                systemPrompt: prompts.widget, // Use specific widget prompt
                model: 'gpt-4o-mini',
                temperature: 0.4,
                requiresAuth: false,
                messagePersistenceDisabled: true,
                corsEnabled: true,
                useDeepSearch: false,
                useWebScraper: false,
                operationName: `widget_chat_${this.operationId}`,
                cacheEnabled: true,
                messageHistoryLimit: 20,
                maxTokens: 800,
                body: {
                    deepSearchEnabled: false,
                    sessionId: requestBody.id || requestBody.sessionId,
                    userId: undefined,
                    agentType: 'default',
                    isWidgetChat: true,
                    bypassAuth: true
                }
            };
            edgeLogger.info('Widget config prepared', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId: this.operationId,
                durationMs: Date.now() - setupStartTime,
            });
            return widgetConfig;
        }

        // --- Handle Main Chat Path (Always Use Orchestrator) --- 
        edgeLogger.info('Processing main chat request: Invoking orchestrator.', { category: LOG_CATEGORIES.SYSTEM, operationId: this.operationId });

        // Extract necessary info for orchestrator
        const requestedAgentId = requestBody.agentId as AgentType || 'default';
        const sessionId = requestBody.id || requestBody.sessionId;
        let lastUserMessageContent: string = '';
        if (requestBody.messages && Array.isArray(requestBody.messages) && requestBody.messages.length > 0) {
            const lastMessage = requestBody.messages[requestBody.messages.length - 1];
            if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
                lastUserMessageContent = lastMessage.content;
            }
        } else if (requestBody.message && typeof requestBody.message.content === 'string') {
            lastUserMessageContent = requestBody.message.content;
        }

        if (!lastUserMessageContent) {
            edgeLogger.error('Could not extract user message content for orchestrator', { category: LOG_CATEGORIES.SYSTEM, operationId: this.operationId, sessionId });
            // Handle error appropriately - maybe throw or return default error response? Here we throw.
            throw new Error('Missing user message content');
        }

        try {
            // Always run the orchestrator for non-widget requests
            const orchestratorResult = await this.agentOrchestrator.run(lastUserMessageContent, requestedAgentId);

            // Package the result
            const response: OrchestratedResponse = {
                type: 'orchestrated',
                data: orchestratorResult
            };

            edgeLogger.info('Orchestration completed successfully via ChatSetupService', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operationId: this.operationId,
                durationMs: Date.now() - setupStartTime
            });
            return response;

        } catch (orchestrationError) {
            edgeLogger.error('Orchestration failed within ChatSetupService', {
                category: LOG_CATEGORIES.ORCHESTRATOR,
                operationId: this.operationId,
                error: orchestrationError instanceof Error ? orchestrationError.message : String(orchestrationError),
                important: true
            });
            // Re-throw to let the API handler manage the final error response
            throw orchestrationError;
        }
    }
} 