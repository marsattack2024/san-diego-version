// Import environment variables first
import './load-env';

import { createEmbedding, generateEmbeddings } from '../lib/vector/embeddings';

async function testEmbeddings() {
  console.log('Testing embeddings functionality...');
  
  // Test single embedding
  try {
    console.log('\n1. Testing single embedding creation:');
    const testText = 'This is a test sentence for embedding generation.';
    console.log(`Input text: "${testText}"`);
    
    const embedding = await createEmbedding(testText);
    console.log(`✅ Successfully created embedding with ${embedding.length} dimensions`);
    console.log(`First few values: [${embedding.slice(0, 5).join(', ')}...]`);
  } catch (error) {
    console.error('❌ Error creating single embedding:', error);
  }
  
  // Test batch embeddings with chunking
  try {
    console.log('\n2. Testing batch embeddings with chunking:');
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
  } catch (error) {
    console.error('❌ Error creating batch embeddings:', error);
  }
}

// Run the tests
testEmbeddings()
  .then(() => console.log('\nEmbedding tests completed'))
  .catch(err => console.error('Test execution failed:', err)); 