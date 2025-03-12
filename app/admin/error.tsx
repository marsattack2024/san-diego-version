'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Admin dashboard error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Something went wrong
          </CardTitle>
          <CardDescription>
            An error occurred in the admin dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-md">
            <p className="text-sm font-medium">Error: {error.message || 'Unknown error'}</p>
            {error.digest && (
              <p className="text-xs mt-1 text-red-600 dark:text-red-400">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" asChild>
            <Link href="/admin">Back to Dashboard</Link>
          </Button>
          <Button onClick={reset}>Try Again</Button>
        </CardFooter>
      </Card>
    </div>
  );
}