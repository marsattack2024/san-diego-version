'use client';

import React from 'react';
import { ErrorBoundary } from './error-boundary';

export function ClientErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
} 