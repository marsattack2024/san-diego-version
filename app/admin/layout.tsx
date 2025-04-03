'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home, Users, ArrowLeft, Menu, X, AlertTriangle, Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuthStore } from '@/stores/auth-store';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAdmin, checkAdminRole, isAuthenticated, user } = useAuthStore();
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(true);
  const [adminVerified, setAdminVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  // Enhanced admin verification on mount
  useEffect(() => {
    async function verifyAdminStatus() {
      try {
        setIsVerifyingAdmin(true);
        setVerificationError('');

        if (!isAuthenticated || !user) {
          edgeLogger.warn('Unauthenticated user attempting to access admin area', {
            category: LOG_CATEGORIES.AUTH,
            path: pathname || ''
          });

          setVerificationError('You must be logged in to access the admin area');
          router.push(`/login?returnTo=${encodeURIComponent(pathname || '/')}`);
          return;
        }

        // Use store's checkAdminRole which checks JWT, profile, and API in that order
        const isAdminResult = await checkAdminRole();

        edgeLogger.info('Admin verification result', {
          category: LOG_CATEGORIES.AUTH,
          isAdmin: isAdminResult,
          userId: user.id.substring(0, 8) + '...',
          path: pathname || ''
        });

        setAdminVerified(isAdminResult);

        if (!isAdminResult) {
          setVerificationError('You do not have admin privileges');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        edgeLogger.error('Error verifying admin status', {
          category: LOG_CATEGORIES.AUTH,
          error: errorMessage,
          path: pathname || ''
        });

        setVerificationError('Error verifying admin status');
      } finally {
        setIsVerifyingAdmin(false);
      }
    }

    verifyAdminStatus();
  }, [isAuthenticated, user, pathname, router, checkAdminRole]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  // Loading state while verifying admin status
  if (isVerifyingAdmin) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <div className="flex h-screen w-screen items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="mt-4 text-lg">Verifying admin privileges...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Error state if not admin
  if (!adminVerified) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <div className="flex h-screen w-screen items-center justify-center p-6">
          <div className="max-w-md w-full">
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Access Denied</AlertTitle>
              <AlertDescription>
                {verificationError || 'You do not have permission to access this area'}
              </AlertDescription>
            </Alert>

            <Button
              className="w-full"
              variant="default"
              onClick={() => router.push('/chat')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Return to Chat
            </Button>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Mobile Header - Only visible on mobile */}
        {isMobile && (
          <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 md:hidden sticky top-0 z-20">
            <h1 className="text-xl font-semibold">Admin Panel</h1>
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </header>
        )}

        {/* Sidebar with ShadCN styling - Enhanced Responsive */}
        <div
          className={cn(
            "bg-sidebar text-sidebar-foreground border-r border-border",
            isMobile
              ? `fixed inset-y-0 left-0 z-50 w-[85%] max-w-[280px] transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
              : "w-64"
          )}
        >
          {/* Mobile close button inside sidebar for better UX */}
          {isMobile && (
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="md:hidden">
                <X className="h-5 w-5" />
              </Button>
            </div>
          )}

          <div className="p-4">
            <h1 className="font-bold text-xl mb-6">Admin Dashboard</h1>
            <nav className="space-y-2">
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent transition-colors",
                  pathname === "/admin" && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => isMobile && setSidebarOpen(false)}
              >
                <Home className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>

              <Link
                href="/admin/users"
                className={cn(
                  "flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent transition-colors",
                  pathname === "/admin/users" && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => isMobile && setSidebarOpen(false)}
              >
                <Users className="h-4 w-4" />
                <span>Users</span>
              </Link>

              {/* WIDGET LINK - Normal styling like other links */}
              <Link
                href="/admin/widget"
                className={cn(
                  "flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent transition-colors relative",
                  pathname === "/admin/widget" && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={() => isMobile && setSidebarOpen(false)}
              >
                <svg
                  className="h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Widget</span>
              </Link>

              <div className="pt-6">
                <Link
                  href="/chat"
                  className="flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium border border-border"
                  onClick={() => isMobile && setSidebarOpen(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Chat</span>
                </Link>
              </div>
            </nav>
          </div>
        </div>

        {/* Improved overlay for mobile sidebar - better transitions */}
        {isMobile && (
          <div
            className={`fixed inset-0 bg-black transition-opacity duration-200 ${sidebarOpen ? 'opacity-50 z-40' : 'opacity-0 -z-10'
              }`}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content - Enhanced Responsive */}
        <div className={cn(
          "flex flex-col flex-1",
          isMobile ? "w-full" : ""
        )}>
          {/* Desktop Header - Only visible on desktop */}
          {!isMobile && (
            <header className="h-16 bg-background border-b border-border flex items-center px-6 sticky top-0 z-10">
              <h1 className="text-xl font-semibold">Admin Panel</h1>
            </header>
          )}
          <main className="flex-1 p-2 sm:p-4 md:p-6 bg-background overflow-x-auto">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}