/**
 * Admin Widget Layout
 * This is a minimal layout that allows the page to render properly
 * and satisfies Next.js type system requirements.
 */

// Export configuration matching what Next.js expects
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";
export const revalidate = 0;

export default function AdminWidgetLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
} 