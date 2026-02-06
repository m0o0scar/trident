'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';

function WorkspaceSettingsContent() {
    const searchParams = useSearchParams();
    const repoPath = searchParams.get('path');

    useWorkspaceTitle(repoPath);

    return <div className="p-8">Settings (To Be Implemented)</div>;
}

export default function WorkspaceSettingsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>}>
            <WorkspaceSettingsContent />
        </Suspense>
    );
}
