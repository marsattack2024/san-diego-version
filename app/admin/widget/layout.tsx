import { Metadata } from 'next'

// Force dynamic rendering to ensure proper authentication checks in production
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: 'Widget Management',
  description: 'Configure and manage the embedding of the Marlin chat widget',
}

export default function AdminWidgetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 