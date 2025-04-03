'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

/**
 * CircuitBreakerDebug - Development-only component for monitoring circuit breaker status
 * This component has been deprecated as the circuit breaker pattern has been removed
 * in favor of Row Level Security for data protection.
 * 
 * @param inline - If true, displays as an inline element in the header instead of a floating card
 */
export function CircuitBreakerDebug({ inline = false }: { inline?: boolean }) {
    // Only show in development mode
    if (process.env.NODE_ENV === 'production') {
        return null;
    }

    // If inline mode is enabled, render a simple badge with deprecation message
    if (inline) {
        return (
            <div className="relative">
                <Badge
                    className="bg-gray-500 text-white cursor-pointer"
                >
                    CB: Deprecated
                </Badge>
            </div>
        );
    }

    // Otherwise render the floating card version with a deprecation message
    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm opacity-90 hover:opacity-100 transition-opacity">
            <Card className="shadow-lg border border-gray-300">
                <CardHeader className="py-2">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-sm">Circuit Breaker</CardTitle>
                        <Badge className="bg-gray-500 text-white">
                            Deprecated
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="py-2">
                    <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Deprecated Component</AlertTitle>
                        <AlertDescription className="text-xs mt-1">
                            The circuit breaker pattern has been removed and replaced with Supabase Row Level Security.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        </div>
    );
} 