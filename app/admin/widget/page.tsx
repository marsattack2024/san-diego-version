// Server Component - No 'use client' directive

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import WidgetAdminClient from '@/app/admin/widget/widget-admin-client';

// These route options work correctly with server components
export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function AdminWidgetPage() {
  console.log('[Server] AdminWidgetPage: Starting server-side authentication check');

  // Server-side auth check
  const supabase = await createClient();

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.log('[Server] AdminWidgetPage: User not authenticated, redirecting to login');
    redirect('/login');
  }

  // Check admin status using the RPC function (bypasses RLS issues)
  const { data: isAdmin, error } = await supabase.rpc('is_admin', {
    uid: user.id
  });

  console.log('[Server] AdminWidgetPage: Admin check result:', { isAdmin, error });

  if (!isAdmin) {
    console.log('[Server] AdminWidgetPage: User not an admin, redirecting to unauthorized');
    redirect('/unauthorized');
  }

  // User is authenticated and an admin, render the widget admin page with client component
  return (
    <div className="space-y-6 p-6 border rounded-md">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure and manage your chat widget
        </p>
      </div>

      {/* The client component handles all interactive features */}
      <WidgetAdminClient />
    </div>
  );
} 