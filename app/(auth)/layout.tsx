import { AuthButton } from '@/components/auth/auth-button';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="flex-1"></div>
        <div className="flex items-center gap-2">
          {/* Auth button not needed on login page */}
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
} 