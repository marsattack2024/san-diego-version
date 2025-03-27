import { Metadata } from 'next'

// Server component layout that exports route configuration

// Force dynamic rendering for proper authentication 
export const dynamic = "force-dynamic";

// Force all requests to revalidate for this route
export const fetchCache = 'force-no-store';

// Disable caching for this route
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Widget Management',
  description: 'Configure and manage the embedding of the Marlin chat widget',
}

export default function AdminWidgetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="admin-widget-layout">
      {children}
    </div>
  );
} 