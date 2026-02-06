'use client';

import { useSearchParams } from 'next/navigation';
import { HistoryView } from '@/components/git/history-view';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';

function WorkspaceHistoryContent() {
    const searchParams = useSearchParams();
    const repoPath = searchParams.get('path');

    useWorkspaceTitle(repoPath);

    if (!repoPath) {
        return <div className="p-8">No repository path specified.</div>;
    }

    return <HistoryView repoPath={repoPath} />;
}

export default function WorkspaceHistoryPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>}>
            <WorkspaceHistoryContent />
        </Suspense>
    );
}
