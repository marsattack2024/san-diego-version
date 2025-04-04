import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout min-h-screen flex flex-col">
      <main className="flex-1">{children}</main>
    </div>
  );
}

