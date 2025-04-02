// This route must remain a serverless function (NOT edge runtime)
// because it needs to handle longer-running API requests to Perplexity
// and has access to more memory and CPU resources

export const runtime = 'nodejs';
export const preferredRegion = 'iad1'; // US East (N. Virginia)
export const maxDuration = 60; // Give this route up to 60 seconds to complete 