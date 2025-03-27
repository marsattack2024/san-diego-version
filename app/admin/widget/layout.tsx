/**
 * Admin Widget Layout
 * This is a minimal layout that allows the page to render properly
 * and satisfies Next.js type system requirements.
 */

// Server component that exports route configuration options
export const dynamic = "force-dynamic";

export default function AdminWidgetLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
} 