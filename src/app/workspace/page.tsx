'use client';

import { useSearchParams } from 'next/navigation';
import { StatusView } from '@/components/git/status-view';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

function WorkspaceStatusContent() {
  const searchParams = useSearchParams();
  const repoPath = searchParams.get('path');

  if (!repoPath) {
    return <div className="p-8">No repository path specified.</div>;
  }

  return <StatusView repoPath={repoPath} />;
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>}>
      <WorkspaceStatusContent />
    </Suspense>
  );
}
