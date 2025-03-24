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
 * Creates a function to validate and fix AI responses
 * Ensures all tools used are properly reported in the response
 */
export function createResponseValidator(config: ResponseValidationConfig) {
  const { toolsUsed, toolResults, urls = [] } = config;
  
  return (response: string): string => {
    // Handle empty responses or responses without content
    if (!response || response.trim() === '') {
      edgeLogger.warn('Received empty response, creating a default message with tools used', {
        hadEmptyResponse: true,
        toolsUsed
      });
      
      // Create a default message with only the tools section
      const toolsSection = `I've gathered information using the following tools:\n\n--- Tools and Resources Used ---\n${toolsUsed.map(tool => {
        if (tool === 'Knowledge Base' && toolResults.ragContent) {
          return `- Knowledge Base: Retrieved ${toolResults.ragContent.length} characters of relevant information`;
        }
        if (tool === 'Web Scraper' && toolResults.webScraper) {
          return `- Web Scraper: Analyzed ${urls.length} URLs with ${toolResults.webScraper.length} characters of content`;
        }
        if (tool === 'Deep Search' && toolResults.deepSearch) {
          return `- Deep Search: Retrieved ${toolResults.deepSearch.length} characters of additional context through web search`;
        }
        return `- ${tool}: No content retrieved`;
      }).join('\n')}`;
      
      return toolsSection;
    }
    
    // Check if the response includes the tools used section
    const toolsUsedSection = response.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);
    
    // If no tools used section is found, add it
    if (!toolsUsedSection) {
      edgeLogger.warn('Response missing Tools and Resources Used section, adding it', {
        responseLength: response.length
      });
      
      return response + `\n\n--- Tools and Resources Used ---\n${toolsUsed.map(tool => {
        if (tool === 'Knowledge Base' && toolResults.ragContent) {
          return `- Knowledge Base: Retrieved ${toolResults.ragContent.length} characters of relevant information`;
        }
        if (tool === 'Web Scraper' && toolResults.webScraper) {
          return `- Web Scraper: Analyzed ${urls.length} URLs with ${toolResults.webScraper.length} characters of content`;
        }
        if (tool === 'Deep Search' && toolResults.deepSearch) {
          return `- Deep Search: Retrieved ${toolResults.deepSearch.length} characters of additional context through web search`;
        }
        return `- ${tool}: No content retrieved`;
      }).join('\n')}`;
    }
    
    // Check if all used tools are mentioned in the section
    const sectionContent = toolsUsedSection[1];
    const missingTools = [];
    
    for (const tool of toolsUsed) {
      // Check if the tool is mentioned in the section
      if (!sectionContent.includes(tool)) {
        missingTools.push(tool);
      }
    }
    
    // If there are missing tools, add them to the section
    if (missingTools.length > 0) {
      edgeLogger.warn('Response missing some tools in Tools and Resources Used section', {
        missingTools,
        sectionContent
      });
      
      // Replace the existing section with a corrected one
      const correctedSection = `--- Tools and Resources Used ---\n${toolsUsed.map(tool => {
        if (tool === 'Knowledge Base' && toolResults.ragContent) {
          return `- Knowledge Base: Retrieved ${toolResults.ragContent.length} characters of relevant information`;
        }
        if (tool === 'Web Scraper' && toolResults.webScraper) {
          return `- Web Scraper: Analyzed ${urls.length} URLs with ${toolResults.webScraper.length} characters of content`;
        }
        if (tool === 'Deep Search' && toolResults.deepSearch) {
          return `- Deep Search: Retrieved ${toolResults.deepSearch.length} characters of additional context through web search`;
        }
        return `- ${tool}: No content retrieved`;
      }).join('\n')}`;
      
      return response.replace(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/, correctedSection + '\n\n');
    }
    
    return response;
  };
} 