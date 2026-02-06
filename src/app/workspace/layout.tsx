import { Sidebar } from '@/components/layout/sidebar';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { Metadata } from 'next';

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
    const params = await searchParams;
    const repoPath = params?.path as string | undefined;
    const repoName = repoPath ? repoPath.split('/').pop() : 'Workspace';
    
    return {
        title: `${repoName} - Forkly`,
    };
}

export default function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen max-h-screen">
            <Suspense fallback={<div className="w-64 border-r min-h-screen bg-gray-50/40 dark:bg-gray-900/40 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
                <Sidebar />
            </Suspense>
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
