/**
 * Mock Data for Tests
 * 
 * This module provides reusable test data sets that can be used
 * across multiple tests.
 */

// Mock user data
export const mockUsers = {
  admin: {
    id: 'test-admin-id',
    email: 'admin@example.com',
    name: 'Test Admin',
    role: 'admin'
  },
  regular: {
    id: 'test-user-id',
    email: 'user@example.com',
    name: 'Test User',
    role: 'authenticated'
  },
  anonymous: {
    id: null,
    email: null,
    name: null,
    role: 'anonymous'
  }
};

// Mock document data for RAG tests
export const mockDocuments = [
  {
    id: 'doc-1',
    content: 'This is a test document about machine learning models.',
    metadata: {
      title: 'Introduction to Machine Learning',
      source: 'test-source',
      author: 'Test Author',
      created_at: '2023-01-01T00:00:00Z'
    }
  },
  {
    id: 'doc-2',
    content: 'Transformers are neural network architectures that use self-attention mechanisms.',
    metadata: {
      title: 'Transformer Architecture',
      source: 'test-source',
      author: 'Test Author',
      created_at: '2023-01-02T00:00:00Z'
    }
  },
  {
    id: 'doc-3',
    content: 'LLMs (Large Language Models) are trained on massive text corpora.',
    metadata: {
      title: 'Large Language Models',
      source: 'test-source',
      author: 'Test Author',
      created_at: '2023-01-03T00:00:00Z'
    }
  }
];

// Mock embeddings for vector tests
export const mockEmbeddings = {
  'doc-1': new Float32Array(Array(1536).fill(0).map(() => Math.random() * 2 - 1)),
  'doc-2': new Float32Array(Array(1536).fill(0).map(() => Math.random() * 2 - 1)),
  'doc-3': new Float32Array(Array(1536).fill(0).map(() => Math.random() * 2 - 1))
};

// Mock query for RAG tests
export const mockQueries = {
  machineLearningSimilar: 'How do machine learning models work?',
  transformerSimilar: 'What are transformers in neural networks?',
  llmSimilar: 'Tell me about large language models',
  unrelated: 'What is the capital of France?'
};

// Mock API responses
export const mockAPIResponses = {
  openai: {
    chat: {
      content: 'This is a mock response from the OpenAI API.',
      role: 'assistant',
      model: 'gpt-4o',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25
      }
    },
    embedding: {
      data: [
        {
          embedding: Array(1536).fill(0).map(() => Math.random() * 2 - 1),
          index: 0
        }
      ],
      model: 'text-embedding-ada-002',
      usage: {
        prompt_tokens: 8,
        total_tokens: 8
      }
    }
  },
  perplexity: {
    chat: {
      content: 'This is a mock response from the Perplexity API.',
      role: 'assistant',
      model: 'llama-3-sonar-small-32k-online',
      usage: {
        prompt_tokens: 12,
        completion_tokens: 18,
        total_tokens: 30
      }
    }
  }
};

// Mock web content for scraper tests
export const mockWebContent = {
  simple: '<html><body><h1>Test Page</h1><p>This is a test page for web scraping.</p></body></html>',
  complex: `
    <html>
      <head>
        <title>Test Website</title>
        <meta name="description" content="Test website for scraper testing">
      </head>
      <body>
        <header>
          <h1>Test Website</h1>
          <nav>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/about">About</a></li>
              <li><a href="/contact">Contact</a></li>
            </ul>
          </nav>
        </header>
        <main>
          <article>
            <h2>Article Title</h2>
            <p>This is the first paragraph of the article.</p>
            <p>This is the second paragraph with some <strong>bold text</strong> and <em>italic text</em>.</p>
            <ul>
              <li>List item 1</li>
              <li>List item 2</li>
              <li>List item 3</li>
            </ul>
          </article>
        </main>
        <footer>
          <p>&copy; 2023 Test Website</p>
        </footer>
      </body>
    </html>
  `,
  invalid: '<html><body>Invalid</not-closed-tag></body></html>'
};

// Mock cache data
export const mockCacheData = {
  ragResults: {
    documents: mockDocuments.slice(0, 2),
    similarity: [0.95, 0.87]
  },
  scrapedContent: mockWebContent.simple,
  perplexityResponse: mockAPIResponses.perplexity.chat
};

// Mock errors
export const mockErrors = {
  database: new Error('Database connection error'),
  api: new Error('API request failed'),
  timeout: new Error('Request timed out'),
  notFound: new Error('Resource not found'),
  validation: new Error('Invalid input data')
}; 