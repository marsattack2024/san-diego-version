// Server Component - No 'use client' directive

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/server';

// These route options work correctly with server components
export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function AdminWidgetPage() {
  console.log('[Server] AdminWidgetPage: Starting server-side authentication check');

  // Server-side auth check using the service role key to bypass RLS
  try {
    // Use admin client with service role key (bypasses RLS)
    const supabase = createAdminClient();

    // Check authentication (this still works even with admin client)
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('[Server] AdminWidgetPage: User not authenticated, redirecting to login');
      redirect('/login');
    }

    // Direct DB query to check admin status (bypassing RLS with service role)
    // First check profiles table
    const { data: profileData } = await supabase
      .from('sd_user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    // Then check roles table as fallback
    const { data: roleData } = await supabase
      .from('sd_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = profileData?.is_admin === true || (roleData && roleData.role === 'admin');

    console.log('[Server] AdminWidgetPage: Admin check result:', {
      isAdmin,
      profileAdmin: profileData?.is_admin,
      hasAdminRole: !!roleData
    });

    if (!isAdmin) {
      console.log('[Server] AdminWidgetPage: User not an admin, redirecting to unauthorized');
      redirect('/unauthorized');
    }

    // User is authenticated and an admin, render the widget admin page
    return (
      <div className="space-y-6 p-6 border rounded-md">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Configure and manage your chat widget
          </p>
        </div>

        {/* Static content since we're using a server component */}
        <div className="border rounded-md p-4 bg-slate-50">
          <p><strong>Current Time:</strong> {new Date().toISOString()}</p>
          <p><strong>Environment:</strong> {process.env.NODE_ENV}</p>
          <p><strong>Server Authentication:</strong> <span className="text-green-600">✓ Verified</span></p>
          <p><strong>Admin Status:</strong> <span className="text-green-600">✓ Confirmed</span></p>
          <p className="text-sm text-muted-foreground mt-4">
            This widget configuration interface is rendered server-side.
            Interactive elements will be added in the next iteration.
          </p>
        </div>
      </div>
    );
  } catch (error) {
    console.error('[Server] AdminWidgetPage: Error checking authentication', error);
    redirect('/error?message=Error+checking+authentication');
  }
} 