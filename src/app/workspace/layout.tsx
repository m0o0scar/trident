import { Sidebar } from '@/components/layout/sidebar';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen max-h-screen">
            <Suspense fallback={<div className="w-64 border-r min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
                <Sidebar />
            </Suspense>
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
