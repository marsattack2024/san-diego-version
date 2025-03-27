'use client';

// Force dynamic rendering for proper authentication
export const dynamic = "force-dynamic";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function SimpleAdminWidgetPage() {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const router = useRouter();
  const { isAuthenticated, isAdmin, checkAuth, checkAdminRole } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

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