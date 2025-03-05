import { NextRequest, NextResponse } from 'next/server';
import { generateUUID } from '@/lib/utils';

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  // If no ID is provided, return all documents
  if (!id) {
    return NextResponse.json(Object.values(mockDocuments));
  }

  // If ID is provided, return the specific document
  const document = mockDocuments[id as keyof typeof mockDocuments];
  
  if (!document) {
    return NextResponse.json([]);
  }

  return NextResponse.json([document]);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, content, kind } = body;

  // Create a new document
  const id = generateUUID();
  const newDocument = {
    id,
    title: title || 'Untitled Document',
    content: content || '',
    kind: kind || 'text',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
  };

  // In a real app, you would save this to a database
  // For now, we'll just return the new document
  return NextResponse.json([newDocument]);
} 