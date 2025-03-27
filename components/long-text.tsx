import React from 'react';
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Create stub Popover components
const Popover = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>
);
Popover.displayName = 'Popover';

const PopoverTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    (props, ref) => <button ref={ref} {...props} />
);
PopoverTrigger.displayName = 'PopoverTrigger';

const PopoverContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4 bg-white border rounded shadow-md', className)} {...props} />
);
PopoverContent.displayName = 'PopoverContent';

interface LongTextProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
    threshold?: number
} 