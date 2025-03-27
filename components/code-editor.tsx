'use client';

import React, { useEffect, useRef } from 'react';

// Local interface definition to replace imports
interface CodeEditorProps {
  content: string;
  onChange: (code: string) => void;
  language?: string;
}

export default function CodeEditor({ content, onChange, language = 'javascript' }: CodeEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Update editor with content changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.value !== content) {
      editorRef.current.value = content;
    }
  }, [content]);

  const handleChange = () => {
    if (editorRef.current) {
      onChange(editorRef.current.value);
    }
  };

  return (
    <div className="relative w-full border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-800 border-b">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {language}
        </span>
      </div>
      <textarea
        ref={editorRef}
        className="w-full p-4 font-mono text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-none focus:outline-none"
        rows={10}
        onChange={handleChange}
        defaultValue={content}
      />
    </div>
  );
}
