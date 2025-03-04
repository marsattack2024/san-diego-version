import { echoTool, dateTimeTool } from '../core/agent-tools';
import { webScraperTool, urlDetectionTool } from './web-scraper-tool';
// Import web search tools
import { webSearchTool, combinedSearchTool } from './web-search-tool';
import { deepSearchTool } from './deep-search-tool';

export {
  // Basic tools
  echoTool,
  dateTimeTool,
  
  // Web scraping tools
  webScraperTool,
  urlDetectionTool,
  
  // Web search tools
  webSearchTool,
  deepSearchTool,
  combinedSearchTool,
};

// Export utility functions
export { extractUrls } from './web-scraper-tool'; 