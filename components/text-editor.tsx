'use client';

import React, { memo, useEffect, useRef } from 'react';

// Local type definition to replace removed schema types
interface Suggestion {
  id: string;
  content: string;
  selectionStart?: number;
  selectionEnd?: number;
}

type EditorProps = {
  content: string;
  onChange: (value: string) => void;
  suggestions?: Suggestion[];
  showHighlights?: boolean;
};

const TextEditor = ({
  content,
  onChange,
  suggestions = [],
  showHighlights = true,
}: EditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Handle content changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.textContent = content;
    }
  }, [content]);

  // Update when user types
  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.textContent || '');
    }
  };

  return (
    <div
      className="prose prose-sm max-w-none w-full border rounded-md p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      ref={editorRef}
      contentEditable
      onInput={handleInput}
      suppressContentEditableWarning
    />
  );
};

export default memo(TextEditor);
