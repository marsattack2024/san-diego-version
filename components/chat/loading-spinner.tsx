'use client';

import { Loader } from 'lucide-react';

export function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center p-4">
      <Loader className="h-6 w-6 animate-spin text-gray-500" />
    </div>
  );
} 