// Re-export all tools
import { echoTool, dateTimeTool } from '../core/agent-tools.js';
import { webScraperTool, detectAndScrapeUrlsTool } from './web-scraper-tool.js';
// Import Perplexity API functions directly from the API implementation
import { vectorSearchTool, extractRelevantContext, createContextEnhancedPrompt } from './vector-search-tool.js';

// Export these tools as AgentTool types
export {
  echoTool,
  dateTimeTool,
  webScraperTool,
  detectAndScrapeUrlsTool,
  vectorSearchTool
};

// Export utility functions
export { extractRelevantContext, createContextEnhancedPrompt };

// Import extractUrls directly from url-utils instead of from web-scraper-tool
export { extractUrls } from '../../chat/url-utils';

// Export utility functions for calling the Perplexity API
export { callPerplexityAPI, streamPerplexityAPI } from './perplexity/api'; 