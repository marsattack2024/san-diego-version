import { Metadata } from 'next'

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