import React from 'react';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { cn } from '@/lib/utils';

import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/utils/supabase/auth-provider';
import { AuthHeadersSetup } from '@/components/auth-headers-setup';
import { logApplicationStartup } from '@/lib/logger/edge-logger';
import { DeepSearchTracker } from '@/components/deep-search-tracker';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://chat.vercel.ai'),
  title: 'Marlan - The Photo Profit Bot',
  description: 'Marlan is a RAG, OpenAI, Perplexity, and Web Search Agent that specializes in marketing for portrait photographers.',
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

const LIGHT_THEME_COLOR = 'hsl(0 0% 100%)';
const DARK_THEME_COLOR = 'hsl(240deg 10% 3.92%)';
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en"
      className={cn("bg-background", GeistSans.variable, GeistMono.variable)}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={cn("min-h-screen font-sans antialiased")} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster position="top-center" />
          <AuthProvider>
            <AuthHeadersSetup />
            <DeepSearchTracker />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
