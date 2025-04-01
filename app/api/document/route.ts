import { generateUUID } from '@/lib/utils';
import { successResponse, errorResponse } from '@/lib/utils/route-handler';

export const runtime = 'edge';

// Mock document data for testing
const mockDocuments = {
  // Text document
  'text-doc-1': {
    id: 'text-doc-1',
    title: 'Sample Text Document',
    content: 'This is a sample text document for testing the document preview feature.',
    kind: 'text',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
  },
  // Code document
  'code-doc-1': {
    id: 'code-doc-1',
    title: 'Sample Code Document',
    content: 'function hello() {\n  console.log("Hello, world!");\n}',
    kind: 'code',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
  },
  // Sheet document
  'sheet-doc-1': {
    id: 'sheet-doc-1',
    title: 'Sample Sheet Document',
    content: JSON.stringify([
      ['Name', 'Age', 'City'],
      ['John', '30', 'New York'],
      ['Jane', '25', 'San Francisco'],
      ['Bob', '40', 'Chicago']
    ]),
    kind: 'sheet',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
  },
  // Image document (base64 encoded small image)
  'image-doc-1': {
    id: 'image-doc-1',
    title: 'Sample Image Document',
    content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    kind: 'image',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
  }
};

export async function GET(request: Request): Promise<Response> {
  return errorResponse('Document API endpoint not implemented', null, 501);
}

export async function POST(request: Request): Promise<Response> {
  return errorResponse('Method not implemented', null, 501);
} 