// Import environment variables first - this must be the first import
import '../lib/env-loader';

import { runTest, runTests } from '../lib/test-utils';
import { fileURLToPath } from 'url';
import { findRelevantContent } from '../../lib/vector/embeddings';
import { findSimilarDocumentsOptimized } from '../../lib/vector/documentRetrieval';

// Test queries
const TEST_QUERIES = [
  'What software does Photography to Profits use for lead gen quizzes?',
  'Explain the trademark confusion photography to profits had recently.'
];

/**
 * Test for the findRelevantContent function
 */
async function testFindRelevantContent(): Promise<void> {
  console.log('Testing findRelevantContent function:');
  
  for (const query of TEST_QUERIES) {
    console.log(`\nQuery: "${query}"`);
    
    const startTime = Date.now();
    const results = await findRelevantContent(query);
    const duration = Date.now() - startTime;
    
    if (!results || results.length === 0) {
      console.log(`❌ No relevant documents found (${duration}ms)`);
      continue;
    }
    
    console.log(`✅ Found ${results.length} relevant documents in ${duration}ms`);
    
    // Display the top result
    const topResult = results[0];
    console.log('\nTop result:');
    console.log(`Content: ${topResult.content}`);
    console.log(`Similarity: ${topResult.similarity}`);
  }
}

/**
 * Test for the findSimilarDocumentsOptimized function
 */
async function testFindSimilarDocumentsOptimized(): Promise<void> {
  console.log('\nTesting findSimilarDocumentsOptimized function:');
  
  for (const query of TEST_QUERIES) {
    console.log(`\nQuery: "${query}"`);
    
    const { documents, metrics } = await findSimilarDocumentsOptimized(query);
    
    if (!documents || documents.length === 0) {
      console.log(`❌ No documents found (${metrics.retrievalTimeMs}ms)`);
      continue;
    }
    
    console.log(`✅ Found ${documents.length} documents in ${metrics.retrievalTimeMs}ms`);
    console.log('Performance metrics:');
    console.log(`- Average similarity: ${metrics.averageSimilarity.toFixed(4)}`);
    console.log(`- Highest similarity: ${metrics.highestSimilarity.toFixed(4)}`);
    console.log(`- Retrieval time: ${metrics.retrievalTimeMs}ms`);
    
    // Display the top result
    const topResult = documents[0];
    console.log('\nTop result:');
    console.log(`Content: ${topResult.content.substring(0, 100)}...`);
    console.log(`Similarity: ${topResult.similarity.toFixed(4)}`);
  }
}

/**
 * Main function to run all document search tests
 */
async function main(): Promise<void> {
  await runTests([
    { name: 'Find Relevant Content', fn: testFindRelevantContent },
    { name: 'Find Similar Documents Optimized', fn: testFindSimilarDocumentsOptimized }
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
  { name: 'Find Relevant Content', fn: testFindRelevantContent },
  { name: 'Find Similar Documents Optimized', fn: testFindSimilarDocumentsOptimized }
]; 