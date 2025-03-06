import { config } from 'dotenv';
import { OpenAI } from 'openai';
import path from 'path';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

// Debug output
console.log('Loaded environment variables from .env.local');
console.log('PERPLEXITY_API_KEY exists:', !!process.env.PERPLEXITY_API_KEY);
if (process.env.PERPLEXITY_API_KEY) {
  console.log('API key starts with:', `${process.env.PERPLEXITY_API_KEY.substring(0, 5)}...`);
}

const apiKey = process.env.PERPLEXITY_API_KEY;
if (!apiKey) {
  console.error('PERPLEXITY_API_KEY is required in environment variables');
  process.exit(1);
}

const query = 'What are the latest advancements in quantum computing?';

// Create a client
const perplexity = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://api.perplexity.ai'
});

async function runTest() {
  console.log(`Testing Perplexity API with query: "${query}"`);
  
  try {
    const response = await perplexity.chat.completions.create({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a research assistant. Provide informative answers with sources.'
        },
        {
          role: 'user',
          content: query
        }
      ]
    });
    
    console.log('\nResults:');
    console.log(response.choices[0]?.message?.content);
    
  } catch (error) {
    console.error('Error calling Perplexity API:', error);
  }
}

runTest();