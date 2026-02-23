'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';
import { ConflictResolverView } from '@/components/git/conflict-resolver-view';

function WorkspaceConflictsContent() {
  const searchParams = useSearchParams();
  const repoPath = searchParams.get('path');

  useWorkspaceTitle(repoPath, 'Conflicts');

  if (!repoPath) {
    return <div className="p-8">No repository path specified.</div>;
  }

  return <ConflictResolverView repoPath={repoPath} />;
}

export default function WorkspaceConflictsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="loading loading-spinner"></span></div>}>
      <WorkspaceConflictsContent />
    </Suspense>
  );
}
