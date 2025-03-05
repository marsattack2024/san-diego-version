// Import environment variables first - this must be the first import
import '../lib/env-loader';

import { runTest, runTests } from '../lib/test-utils';
import { createEmbedding, generateEmbeddings } from '../../lib/vector/embeddings';
import { fileURLToPath } from 'url';

// Get the current module's URL
const currentModuleUrl = import.meta.url;

/**
 * Test for creating a single embedding
 */
async function testSingleEmbedding(): Promise<void> {
  const testText = 'This is a test sentence for embedding generation.';
  console.log(`Input text: "${testText}"`);
  
  const embedding = await createEmbedding(testText);
  console.log(`✅ Successfully created embedding with ${embedding.length} dimensions`);
  console.log(`First few values: [${embedding.slice(0, 5).join(', ')}...]`);
  
  // Basic validation
  if (!embedding || embedding.length === 0) {
    throw new Error('Embedding creation failed: Empty embedding returned');
  }
}

/**
 * Test for batch embeddings with chunking
 */
async function testBatchEmbeddings(): Promise<void> {
  const testParagraph = 'This is the first sentence. This is the second sentence. And here is a third one. Let us add one more for good measure.';
  console.log(`Input text: "${testParagraph}"`);
  
  const embeddingsResult = await generateEmbeddings(testParagraph);
  console.log(`✅ Successfully created ${embeddingsResult.length} chunk embeddings`);
  
  // Display chunks and their embedding dimensions
  embeddingsResult.forEach((result, i) => {
    console.log(`\nChunk ${i+1}: "${result.content}"`);
    console.log(`Embedding dimensions: ${result.embedding.length}`);
    console.log(`First few values: [${result.embedding.slice(0, 3).join(', ')}...]`);
  });
  
  // Basic validation
  if (!embeddingsResult || embeddingsResult.length === 0) {
    throw new Error('Batch embedding creation failed: No embeddings returned');
  }
}

/**
 * Main function to run all embedding tests
 */
async function main(): Promise<void> {
  await runTests([
    { name: 'Single Embedding Creation', fn: testSingleEmbedding },
    { name: 'Batch Embeddings with Chunking', fn: testBatchEmbeddings }
  ]);
}

// Run the tests if this module is being executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

// Export the tests for use in other test runners
export const tests = [
  { name: 'Single Embedding Creation', fn: testSingleEmbedding },
  { name: 'Batch Embeddings with Chunking', fn: testBatchEmbeddings }
]; 