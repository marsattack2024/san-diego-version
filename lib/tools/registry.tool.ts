/**
 * Tool Registry
 * 
 * This module provides a centralized registry of AI SDK tools that can be
 * selectively included in different chat implementations. It allows for
 * consistent tool definition while supporting different feature sets.
 */

import { knowledgeBaseTool } from './knowledge-base.tool';
import { webScraperTool } from './web-scraper.tool';
import { deepSearchTool } from './deep-search.tool';
import { Tool } from 'ai';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

/**
 * Standard tools available for all chat implementations
 * Currently contains the knowledge base and web scraper tools
 */
export const standardTools: Record<string, Tool<any, any>> = {
    getInformation: knowledgeBaseTool,
    scrapeWebContent: webScraperTool
};

/**
 * Full set of tools available for the main chat implementation
 * Will include additional tools as they are extracted 
 */
export const fullChatTools: Record<string, Tool<any, any>> = {
    ...standardTools,
    // Additional tools will be added here as they are extracted
};

/**
 * Limited set of tools for the widget chat implementation
 * Only includes the essential tools for simplicity and performance
 */
export const widgetTools: Record<string, Tool<any, any>> = {
    getInformation: knowledgeBaseTool
};

/**
 * Creates a customized tool set based on feature flags
 * @param options - Configuration options for tool selection
 * @returns Object containing selected tools
 */
export function createToolSet(options: {
    useKnowledgeBase?: boolean;
    useWebScraper?: boolean;
    useDeepSearch?: boolean;
}): Record<string, Tool<any, any>> {
    const {
        useKnowledgeBase = true,
        useWebScraper = false,
        useDeepSearch = false
    } = options;

    const toolSet: Record<string, Tool<any, any>> = {};

    // Log tool set creation
    edgeLogger.info('Creating custom tool set', {
        category: LOG_CATEGORIES.TOOLS,
        operation: 'create_tool_set',
        useKnowledgeBase,
        useWebScraper,
        useDeepSearch
    });

    // Add knowledge base tool if enabled
    if (useKnowledgeBase) {
        toolSet.getInformation = knowledgeBaseTool;
    }

    // Add web scraper tool if enabled
    if (useWebScraper) {
        toolSet.scrapeWebContent = webScraperTool;
    }

    // Add Deep Search tool ONLY if explicitly enabled
    if (useDeepSearch) {
        toolSet.deepSearch = deepSearchTool;
    }

    return toolSet;
}

/**
 * Generates a description of available tools for logging or debugging
 * @param tools - Object containing tools
 * @returns Formatted description of tools
 */
export function describeTools(tools: Record<string, Tool<any, any>>): string {
    const toolNames = Object.keys(tools);

    return `Available tools (${toolNames.length}): ${toolNames.join(', ')}`;
} 