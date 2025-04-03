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
     * Determines configuration. FOR WIDGETS ONLY.
     * @returns A promise resolving to ChatEngineConfig (widget).
     */
    async prepareConfig(input: ChatSetupInput): Promise<ChatEngineConfig> {
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
        } else {
            // This path should no longer be taken by the main /api/chat route
            edgeLogger.error('prepareConfig called for non-widget path, which is deprecated.', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId: this.operationId,
                important: true,
            });
            // Throw an error because this indicates a logic flaw elsewhere if it's called
            throw new Error('ChatSetupService.prepareConfig should only be used for widget setups.');
        }
    }
} 