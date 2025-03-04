import type { Metadata } from 'next'
import './globals.css'

// Set up global error handlers for server-side
if (typeof window === 'undefined') {
  // Keep track of errors to prevent infinite loops
  let isLoggingError = false;

  process.on('uncaughtException', (error) => {
    // Skip logging for known Next.js worker exit messages
    // This is a normal part of Next.js operation and not a true error
    if (error instanceof Error && error.message === 'the worker has exited') {
      return;
    }
    
    // Skip module not found errors for vendor chunks which are normal during dev
    if (error instanceof Error && 
        error.message.includes('Cannot find module') && 
        error.message.includes('vendor-chunks')) {
      return;
    }

    // Prevent infinite error loops
    if (isLoggingError) {
      console.error('Error occurred while logging another error', error);
      return;
    }

    // Skip logging for known Next.js worker exit messages
    const errorMessage = error?.message || String(error);
    if (
      errorMessage.includes('the worker has exited') ||
      errorMessage.includes('the worker thread exited') ||
      errorMessage.includes('Cannot find module') && errorMessage.includes('worker.js')
    ) {
      // These are expected during development hot reloading
      console.warn('Next.js worker exit detected (expected during hot reload):', errorMessage);
      return;
    }

    try {
      isLoggingError = true;
      console.error('[FATAL]', { err: error }, 'Uncaught exception');
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
      console.error('Original error:', error);
    } finally {
      isLoggingError = false;
    }
  });
  
  process.on('unhandledRejection', (reason) => {
    // Skip logging for known Next.js worker exit messages
    if (reason instanceof Error && reason.message === 'the worker has exited') {
      return;
    }
    
    // Skip module not found errors for vendor chunks which are normal during dev
    if (reason instanceof Error && 
        reason.message.includes('Cannot find module') && 
        reason.message.includes('vendor-chunks')) {
      return;
    }

    // Prevent infinite error loops
    if (isLoggingError) {
      console.error('Error occurred while logging unhandled rejection', reason);
      return;
    }

    try {
      isLoggingError = true;
      console.error('[FATAL]', { err: reason }, 'Unhandled rejection');
    } catch (loggingError) {
      console.error('Failed to log unhandled rejection:', loggingError);
      console.error('Original rejection:', reason);
    } finally {
      isLoggingError = false;
    }
  });
}

// Set up global error handlers for client-side
if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('[ERROR]', 'Uncaught client error', { message, source, lineno, colno, error });
    return false;
  };
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[ERROR]', 'Unhandled promise rejection', { 
      reason: event.reason,
      promise: 'Promise rejection occurred'
    });
  });
}

export const metadata: Metadata = {
  title: 'v0 App',
  description: 'Created with v0',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
