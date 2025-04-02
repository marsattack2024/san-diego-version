/**
 * Tool-related utility functions for the chat engine.
 * This file contains utilities for working with AI tool calls and extracting tool usage from messages.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

/**
 * Extracts tool usage information from the assistant message
 * 
 * @param text - The assistant message text to parse for tool usage
 * @param operationName - The operation name for logging purposes
 * @returns A record containing the extracted tools information, or undefined if none found
 */
export function extractToolsUsed(text: string, operationName: string): Record<string, any> | undefined {
    try {
        // Look for the markdown-formatted resources section
        // Match both plain text and markdown formatted resources sections
        const toolsSection = text.match(/---\s*(?:\*\*Resources used:?\*\*|Resources used:?)\s*([\s\S]*?)(?:---|\n\n|$)/i);

        if (toolsSection && toolsSection[1]) {
            return {
                tools: toolsSection[1]
                    .split('\n')
                    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
                    .map(line => line.trim())
            };
        }

        return undefined;
    } catch (error) {
        // Safely handle errors without interrupting the message flow
        edgeLogger.warn('Failed to extract tools used', {
            category: LOG_CATEGORIES.SYSTEM,
            operation: operationName,
            error: error instanceof Error ? error.message : String(error)
        });
        return undefined;
    }
}

/**
 * Formats tool usage data for storage
 * 
 * @param toolsData - Raw tool usage data to format
 * @returns Formatted tool usage data ready for storage
 */
export function formatToolUsageData(toolsData: Record<string, any>): Record<string, any> {
    if (!toolsData) return {};

    // Create a standardized format for tool usage data
    return {
        tool_count: toolsData.tools?.length || 0,
        tools_used: toolsData.tools || [],
        api_tool_calls: toolsData.api_tool_calls || []
    };
} 