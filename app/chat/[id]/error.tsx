'use client';

import { useEffect } from 'react';
import { clientLogger } from '@/lib/logger/client-logger';

const log = clientLogger;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error('Chat error:', error);
  }, [error]);

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4">
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
} 