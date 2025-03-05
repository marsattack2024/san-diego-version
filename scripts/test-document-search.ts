// Import environment variables first
import './load-env';

import { findRelevantContent } from '../lib/vector/embeddings';
import { findSimilarDocumentsOptimized } from '../lib/vector/documentRetrieval';

async function testDocumentSearch() {
  console.log('Testing document search functionality...\n');
  
  const testQueries = [
    'What is RAG?',
    'How do embeddings work?',
    'Tell me about vector similarity search',
    'What are the best practices for chunking text?'
  ];
  
  // Test findRelevantContent from embeddings.ts
  console.log('1. Testing findRelevantContent function:');
  for (const query of testQueries) {
    try {
      console.log(`\nQuery: "${query}"`);
      const startTime = Date.now();
      const results = await findRelevantContent(query);
      const duration = Date.now() - startTime;
      
      console.log(`✅ Found ${results.length} relevant documents in ${duration}ms`);
      
      if (results.length > 0) {
        console.log('\nTop result:');
        console.log(`Content: "${results[0].name}"`);
        console.log(`Similarity: ${results[0].similarity.toFixed(4)}`);
      } else {
        console.log('No matching documents found');
      }
    } catch (error) {
      console.error(`❌ Error searching for query "${query}":`, error);
    }
  }
  
  // Test findSimilarDocumentsOptimized from documentRetrieval.ts
  console.log('\n\n2. Testing findSimilarDocumentsOptimized function:');
  for (const query of testQueries) {
    try {
      console.log(`\nQuery: "${query}"`);
      const startTime = Date.now();
      const { documents, metrics } = await findSimilarDocumentsOptimized(query);
      const duration = Date.now() - startTime;
      
      console.log(`✅ Found ${documents.length} documents in ${duration}ms`);
      console.log('Performance metrics:');
      console.log(`- Average similarity: ${metrics.averageSimilarity.toFixed(4)}`);
      console.log(`- Highest similarity: ${metrics.highestSimilarity.toFixed(4)}`);
      console.log(`- Retrieval time: ${metrics.retrievalTimeMs}ms`);
      
      if (documents.length > 0) {
        console.log('\nTop result:');
        console.log(`Content: "${documents[0].content.substring(0, 100)}${documents[0].content.length > 100 ? '...' : ''}"`);
        console.log(`Similarity: ${documents[0].similarity.toFixed(4)}`);
      } else {
        console.log('No matching documents found');
      }
    } catch (error) {
      console.error(`❌ Error searching for query "${query}":`, error);
    }
  }
}

// Run the tests
testDocumentSearch()
  .then(() => console.log('\nDocument search tests completed'))
  .catch(err => console.error('Test execution failed:', err)); 