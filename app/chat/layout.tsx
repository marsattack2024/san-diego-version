import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // For MVP, we'll use a simple layout without authentication
  // Pass undefined for user since we're not implementing auth in the MVP
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar user={undefined} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}

