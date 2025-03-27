/**
 * Custom type declarations for Next.js to help resolve 
 * type checking issues with generated files.
 */

// Declare module for layout files to prevent TypeScript errors
declare module '*/app/admin/widget/layout.js' {
    import { ReactNode } from 'react';

    export const dynamic: "auto" | "force-dynamic" | "error" | "force-static";
    export const fetchCache: "auto" | "default-cache" | "only-cache" | "force-cache" | "default-no-store" | "only-no-store" | "force-no-store";
    export const revalidate: number | false;

    export default function Layout({ children }: { children: ReactNode }): JSX.Element;
}

// Additional declarations can be added here as needed
