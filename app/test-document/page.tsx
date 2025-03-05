'use client';

import { useState } from 'react';
import { DocumentPreview } from '@/components/document-preview';
import { Button } from '@/components/ui/button';

export default function TestDocumentPage() {
  const [documentId, setDocumentId] = useState('text-doc-1');

  const documentTypes = [
    { id: 'text-doc-1', label: 'Text Document' },
    { id: 'code-doc-1', label: 'Code Document' },
    { id: 'sheet-doc-1', label: 'Sheet Document' },
    { id: 'image-doc-1', label: 'Image Document' },
  ];

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Document Preview Test</h1>
      
      <div className="flex gap-4 mb-8">
        {documentTypes.map((type) => (
          <Button 
            key={type.id}
            onClick={() => setDocumentId(type.id)}
            variant={documentId === type.id ? 'default' : 'outline'}
          >
            {type.label}
          </Button>
        ))}
      </div>
      
      <div className="border rounded-lg p-4">
        <DocumentPreview 
          isReadonly={false} 
          result={{ id: documentId, title: 'Test Document', kind: documentId.split('-')[0] }} 
        />
      </div>
    </div>
  );
} 