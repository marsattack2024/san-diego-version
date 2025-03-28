import { edgeLogger } from '@/lib/logger/edge-logger';
import { ToolResults } from '@/lib/agents/prompts';

/**
 * Configuration for response validation
 */
export interface ResponseValidationConfig {
  toolsUsed: string[];
  toolResults: ToolResults;
  urls?: string[];
}

/**
 * Creates a validator function that ensures all tool usage is reported in responses
 * This helps ensure proper attribution and transparent AI responses
 * 
 * @param config - Configuration object with tools used and results
 * @returns A validation function for the AI's response
 */
export function createResponseValidator(config: ResponseValidationConfig | string[]): (response: string) => string {
  // Extract toolsUsed from either config object or direct array
  const toolsUsed = Array.isArray(config) ? config : config.toolsUsed;

  // Skip validation if no tools were used
  if (!toolsUsed || toolsUsed.length === 0) {
    return (response) => response;
  }

  // Normalize tool names for consistent matching
  const normalizedToolsUsed = toolsUsed.map(name =>
    name.toLowerCase().replace(/\s+/g, ' ').trim()
  );

  // Create a set of required tools for faster lookups
  const requiredTools = new Set(normalizedToolsUsed);

  // Log initial state for debugging purposes
  edgeLogger.debug('Response validator initialized', {
    operation: 'validator_init',
    toolsCount: normalizedToolsUsed.length,
    toolsList: normalizedToolsUsed
  });

  // The actual validator function
  return (response: string): string => {
    // Don't modify empty responses
    if (!response || response.trim() === '') {
      return response;
    }

    // If no tools were used, return the response as-is
    if (requiredTools.size === 0) {
      return response;
    }

    // Look for indicators that tools were acknowledged
    // Include both AI SDK tool uses and preprocessing tools
    const lowerResponse = response.toLowerCase();
    const mentionedTools = new Set<string>();

    // Check each required tool to see if it's mentioned
    for (const toolName of requiredTools) {
      // Look for standard tool attribution patterns
      const patterns = [
        // Tool name exact matches with various prefixes
        new RegExp(`\\b${toolName}\\b`, 'i'),
        // "Using data from X" pattern
        new RegExp(`using (data|information|content|results) from [^.]*?\\b${toolName}\\b`, 'i'),
        // "According to X" pattern
        new RegExp(`according to [^.]*?\\b${toolName}\\b`, 'i'),
        // "Based on X" pattern
        new RegExp(`based on [^.]*?\\b${toolName}\\b`, 'i'),
        // Knowledge base specific patterns
        ...(toolName.includes('knowledge base') ?
          [
            /\bknowledge base\b/i,
            /\binternal resources\b/i,
            /\bour resources\b/i
          ] : []
        ),
        // Web scraper specific patterns
        ...(toolName.includes('web scraper') ?
          [
            /\bweb content\b/i,
            /\bwebsite content\b/i,
            /\bpage content\b/i,
            /\bfrom your (site|website|url|link|page)\b/i
          ] : []
        ),
        // Deep search specific patterns
        ...(toolName.includes('deep search') ?
          [
            /\bdeep search\b/i,
            /\bcomprehensive search\b/i,
            /\bsearch results\b/i,
            /\bresearch (shows|indicates|suggests)\b/i
          ] : []
        )
      ];

      // Check each pattern
      for (const pattern of patterns) {
        if (pattern.test(lowerResponse)) {
          mentionedTools.add(toolName);
          break; // Found a mention, no need to check other patterns
        }
      }
    }

    // Check if all required tools were mentioned
    const missingTools = [...requiredTools].filter(tool => !mentionedTools.has(tool));

    // Return the response as-is if all tools were mentioned
    if (missingTools.length === 0) {
      edgeLogger.debug('All tools properly acknowledged', {
        operation: 'validation_success',
        mentionedToolsCount: mentionedTools.size
      });
      return response;
    }

    // Log missing tools for debugging
    edgeLogger.info('Missing tool attributions in response', {
      operation: 'validation_failure',
      missingTools,
      mentionedTools: [...mentionedTools],
      responseLengthChars: response.length
    });

    // Generate an addendum to acknowledge missing tools
    const addendum = generateToolsAddendum(missingTools);

    // Return the response with the added acknowledgment
    return response + '\n\n' + addendum;
  };
}

/**
 * Generates an appropriate addendum to acknowledge missing tools
 * This is added to the response when tools aren't properly cited
 */
function generateToolsAddendum(missingTools: string[]): string {
  // Different format based on number of missing tools
  if (missingTools.length === 1) {
    const tool = missingTools[0];

    // Customize message based on tool type
    if (tool.includes('knowledge base')) {
      return `Note: This response includes information from our knowledge base.`;
    } else if (tool.includes('web scraper')) {
      return `Note: This response includes analysis of your website content.`;
    } else if (tool.includes('deep search')) {
      return `Note: This response includes information from our deep search.`;
    } else {
      // Generic acknowledgment
      return `Note: This response utilized ${tool}.`;
    }
  } else {
    // Multiple tools case - list all missing tools
    const toolsList = missingTools.map(tool => {
      // Make the tool names more user-friendly
      if (tool.includes('knowledge base')) return 'our knowledge base';
      if (tool.includes('web scraper')) return 'website content analysis';
      if (tool.includes('deep search')) return 'deep search';
      return tool;
    }).join(' and ');

    return `Note: This response includes information from ${toolsList}.`;
  }
} 