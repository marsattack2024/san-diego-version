'use client';

// Force dynamic rendering for proper authentication
export const dynamic = "force-dynamic";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChatWidgetRoot, ChatWidgetProvider } from '@/components/chat-widget';
import { AdminWidgetConfigurator } from '@/components/admin/widget/widget-configurator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AdminWidgetPage() {
  const [error, setError] = useState<Error | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();

  // Enhanced logging to help debug production issues
  useEffect(() => {
    console.log('AdminWidgetPage: Component mounted', {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'server-side',
      dynamic: typeof dynamic !== 'undefined' ? dynamic : 'undefined'
    });
    
    // Log when component unmounts
    return () => {
      console.log('AdminWidgetPage: Component unmounted');
    };
  }, []);

  // Enhanced authentication with admin status check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('AdminWidgetPage: Checking auth and admin status');
        const supabase = createClient();
        
        // First check if user is logged in
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !sessionData?.session?.user) {
          console.error('Auth error or no session:', sessionError);
          setError(new Error('Authentication required. Please log in.'));
          router.push('/login');
          return;
        }
        
        const userId = sessionData.session.user.id;
        console.log('User authenticated:', { userId });
        
        // Check admin status through RPC call (most reliable method)
        const { data: isAdminRpc, error: rpcError } = await supabase.rpc('is_admin', { 
          uid: userId 
        });
        
        if (rpcError) {
          console.error('Admin RPC check error:', rpcError);
          
          // Fallback to profile check
          const { data: profile, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('is_admin')
            .eq('user_id', userId)
            .single();
            
          if (profileError) {
            console.error('Profile check error:', profileError);
          }
            
          if (profileError || !profile?.is_admin) {
            // Not an admin, redirect to unauthorized
            console.log('User not authorized as admin');
            setError(new Error('Admin access required. You do not have administrator privileges.'));
            router.push('/unauthorized');
            return;
          }
          
          setIsAdmin(true);
        } else {
          setIsAdmin(!!isAdminRpc);
          console.log('Admin status from RPC:', !!isAdminRpc);
          
          if (!isAdminRpc) {
            // Not an admin, redirect to unauthorized
            console.log('User not authorized as admin via RPC');
            setError(new Error('Admin access required. You do not have administrator privileges.'));
            router.push('/unauthorized');
            return;
          }
        }
        
        // User is authorized and admin
        setIsLoaded(true);
        setIsChecking(false);
        
      } catch (err) {
        console.error('Auth check error:', err);
        setError(err instanceof Error ? err : new Error('Failed to check authentication'));
        setIsChecking(false);
      }
    };
    
    checkAuth();
  }, [router]);

  // Return loading state while checking auth
  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatWidgetProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Widget Management</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Configure the chat widget and generate embed codes for websites.
          </p>
        </div>
        
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Authentication Error</AlertTitle>
            <AlertDescription>
              {error.message}
              <div className="mt-2">
                <p className="text-xs">If you're seeing this in production, please try refreshing the page or logging in again.</p>
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        <div className="w-full">
          {isLoaded && isAdmin ? (
            <AdminWidgetConfigurator />
          ) : !isChecking && (
            <div className="p-4 border rounded-md bg-gray-50">
              <p>Unable to load widget configurator due to authentication issues.</p>
            </div>
          )}
        </div>
        
        {/* Only show the widget if authenticated and admin */}
        {isLoaded && isAdmin && <ChatWidgetRoot />}
      </div>
    </ChatWidgetProvider>
  );
} 