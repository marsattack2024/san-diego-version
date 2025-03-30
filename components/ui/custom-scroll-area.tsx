import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

/**
 * CustomScrollArea component that provides:
 * 1. Clean overlay scrollbars
 * 2. Consistent styling matching the template
 * 3. Proper scrollbar behavior on different platforms
 */

export interface CustomScrollAreaProps
    extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
    orientation?: 'horizontal' | 'vertical';
    hideScrollbar?: boolean;
}

export const CustomScrollArea = forwardRef<
    React.ElementRef<typeof ScrollAreaPrimitive.Root>,
    CustomScrollAreaProps
>(({
    className,
    children,
    orientation = 'vertical',
    hideScrollbar = false,
    ...props
}, ref) => (
    <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn('relative overflow-hidden flex-1 flex flex-col', className)}
        {...props}
    >
        <ScrollAreaPrimitive.Viewport
            className={cn(
                'h-full w-full rounded-[inherit] flex-1',
                orientation === 'horizontal' && '!overflow-x-auto'
            )}
        >
            {children}
        </ScrollAreaPrimitive.Viewport>

        {!hideScrollbar && (
            <CustomScrollbar orientation={orientation} />
        )}

        <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
));

CustomScrollArea.displayName = "CustomScrollArea";

export interface CustomScrollbarProps
    extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> {
    showAlways?: boolean;
}

export const CustomScrollbar = forwardRef<
    React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
    CustomScrollbarProps
>(({
    className,
    orientation = 'vertical',
    showAlways = false,
    ...props
}, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
        ref={ref}
        orientation={orientation}
        className={cn(
            'flex touch-none select-none transition-colors',
            orientation === 'vertical' &&
            'h-full w-2 border-l border-l-transparent p-[1px]',
            orientation === 'horizontal' &&
            'h-2 flex-col border-t border-t-transparent p-[1px]',
            className
        )}
        // Use forceMount only if showAlways is true
        {...(showAlways ? { forceMount: true } : {})}
        {...props}
    >
        <ScrollAreaPrimitive.ScrollAreaThumb
            className={cn(
                'relative flex-1 rounded-full bg-muted/60',
                // More transparent/subtle bar
                'opacity-50 hover:opacity-80 transition-opacity'
            )}
        />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
));

CustomScrollbar.displayName = "CustomScrollbar"; 