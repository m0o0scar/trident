import { Sidebar } from '@/components/layout/sidebar';
import { Suspense } from 'react';

export default function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen max-h-screen bg-base-100">
            <Suspense fallback={<div className="w-64 border-r border-base-300 min-h-screen bg-base-200/30 flex items-center justify-center"><span className="loading loading-spinner"></span></div>}>
                <Sidebar />
            </Suspense>
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
