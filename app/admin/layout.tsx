'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home, Users, ArrowLeft } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <div className="flex min-h-screen">
          {/* Sidebar with ShadCN styling */}
          <div className="w-64 bg-sidebar text-sidebar-foreground border-r border-border">
            <div className="p-4">
              <h1 className="font-bold text-xl mb-6">Admin Dashboard</h1>
              <nav className="space-y-2">
                <Link href="/admin" className={cn(
                  "flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent transition-colors",
                  pathname === "/admin" && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}>
                  <Home className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
                
                <Link href="/admin/users" className={cn(
                  "flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium hover:bg-sidebar-accent transition-colors",
                  pathname === "/admin/users" && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}>
                  <Users className="h-4 w-4" />
                  <span>Users</span>
                </Link>
                
                <div className="pt-6">
                  <Link href="/chat" className="flex items-center gap-2 w-full rounded-md p-2 text-sm font-medium border border-border">
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Chat</span>
                  </Link>
                </div>
              </nav>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="flex flex-col flex-1">
            <header className="h-16 bg-background border-b border-border flex items-center px-6">
              <h1 className="text-xl font-semibold">Admin Panel</h1>
            </header>
            <main className="flex-1 p-6 bg-background">{children}</main>
          </div>
        </div>
      </ThemeProvider>
  );
}