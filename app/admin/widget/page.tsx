'use client';

// Remove the server component directives as they don't work with client components
// export const dynamic = "force-dynamic";
// export const fetchCache = 'force-no-store';
// export const revalidate = 0;

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function SimpleAdminWidgetPage() {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const router = useRouter();
  const { isAuthenticated, isAdmin, checkAuth, checkAdminRole } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [apiTestResult, setApiTestResult] = useState<any>(null);
  const [apiTestError, setApiTestError] = useState<string | null>(null);

  // Add a diagnostic API call test
  useEffect(() => {
    async function testAdminApi() {
      try {
        console.log('[Widget Admin] Testing admin API access...');
        const response = await fetch('/api/admin/dashboard');

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Widget Admin] API test failed:', {
            status: response.status,
            statusText: response.statusText,
            headers,
            error: errorText
          });
          setApiTestError(`${response.status}: ${response.statusText}`);
          return;
        }

        const data = await response.json();
        console.log('[Widget Admin] API test succeeded:', {
          status: response.status,
          headers,
          data: typeof data === 'object' ? 'Data received' : data
        });

        setApiTestResult({
          status: response.status,
          success: true,
          receivedData: !!data
        });
      } catch (error) {
        console.error('[Widget Admin] API test error:', error);
        setApiTestError(error instanceof Error ? error.message : String(error));
      }
    }

    // Only run test after admin verification
    if (!isLoading && isAdmin) {
      testAdminApi();
    }
  }, [isLoading, isAdmin]);

  // Check admin status
  useEffect(() => {
    async function verifyAdmin() {
      console.log('[Widget Admin] Starting admin verification');
      setIsLoading(true);
      try {
        // Check authentication status
        const user = await checkAuth();
        if (!user) {
          console.log('[Widget Admin] Not authenticated, redirecting');
          router.push('/login');
          return;
        }

        // Verify admin status specifically
        const hasAdminRole = await checkAdminRole();
        console.log('[Widget Admin] Admin check result:', hasAdminRole);

        if (!hasAdminRole) {
          console.log('[Widget Admin] Not an admin, redirecting');
          router.push('/unauthorized');
          return;
        }

        console.log('[Widget Admin] Successfully verified as admin');
      } catch (error) {
        console.error('[Widget Admin] Error verifying admin status:', error);
      } finally {
        setIsLoading(false);
      }
    }

    verifyAdmin();
  }, [checkAuth, checkAdminRole, router]);

  // Enhanced logging to help debug production issues
  useEffect(() => {
    console.log('--- SimpleAdminWidgetPage: Component mounted', {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'server-side',
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      isAdminWidget: typeof window !== 'undefined' ? window.location.pathname === '/admin/widget' : 'unknown',
      isAuthenticated,
      isAdmin
    });

    // Log when component unmounts
    return () => {
      console.log('--- SimpleAdminWidgetPage: Component unmounted');
    };
  }, [isAuthenticated, isAdmin]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium">Loading admin panel...</p>
          <p className="text-sm text-muted-foreground">Verifying admin permissions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 border rounded-md">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page - Minimal Test</h1>
        <p className="text-sm text-muted-foreground mt-2">
          If you see this, the basic page routing and build worked.
        </p>
        <p className="text-sm text-red-500 mt-2">
          Rendered at: {new Date().toISOString()}
        </p>
      </div>

      {/* API Test Results */}
      <div className="border rounded-md p-4 bg-yellow-50">
        <h3 className="font-medium mb-2">Admin API Test Results</h3>
        {apiTestError ? (
          <div className="text-red-600 text-sm">
            <p>Error: {apiTestError}</p>
            <p className="mt-1">This likely indicates the x-is-admin header issue has been fixed but not yet deployed.</p>
          </div>
        ) : apiTestResult ? (
          <div className="text-green-600 text-sm">
            <p>Success! API responded with status: {apiTestResult.status}</p>
            <p className="mt-1">The admin API access is working correctly.</p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Testing API access...</p>
        )}
      </div>

      <div className="border rounded-md p-4 bg-slate-50">
        <p><strong>Current Time:</strong> {timestamp}</p>
        <p><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</p>
        <p><strong>Pathname:</strong> {typeof window !== 'undefined' ? window.location.pathname : 'server-rendered'}</p>
        <p><strong>Is Admin:</strong> {isAdmin ? 'Yes' : 'No'}</p>
        <p><strong>Is Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
        <button
          className="px-4 py-2 mt-2 bg-blue-500 text-white rounded-md"
          onClick={() => {
            console.log('Update timestamp clicked in widget page');
            setTimestamp(new Date().toISOString());
          }}
        >
          Update Timestamp
        </button>
      </div>
    </div>
  );
} 