'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <h1 className="mb-4 text-4xl font-bold text-red-500">Access Denied</h1>
        <div className="mb-6 text-gray-700 dark:text-gray-300">
          <p className="mb-4">
            You don't have permission to access this page.
          </p>
          <p>
            If you believe this is an error, please contact your administrator.
          </p>
        </div>
        <div className="flex space-x-4 justify-center">
          <Button asChild>
            <Link href="/">
              Return Home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/chat">
              Go to Chat
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}