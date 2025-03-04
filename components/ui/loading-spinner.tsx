"use client";

import * as React from "react";
import { cn } from '@/lib/utils';
import { Loader2 } from "lucide-react";

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The size of the spinner
   * @default "md"
   */
  size?: "sm" | "md" | "lg";
  /**
   * Whether to show the spinner with a label
   */
  label?: string;
}

/**
 * A loading spinner component that follows ShadCN UI design patterns
 */
const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ className, size = "md", label, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    };

    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2", className)}
        {...props}
      >
        <Loader2
          className={cn(
            "animate-spin text-muted-foreground",
            sizeClasses[size]
          )}
        />
        {label && (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
      </div>
    );
  }
);

LoadingSpinner.displayName = "LoadingSpinner";

export { LoadingSpinner }; 