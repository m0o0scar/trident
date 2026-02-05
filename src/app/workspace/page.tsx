
'use client';

import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useState } from 'react';
import { useGitStatus } from '@/hooks/use-git';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { StatusView } from '@/components/git/status-view';
import { HistoryView } from '@/components/git/history-view';


import { Suspense } from 'react';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const repoPath = searchParams.get('path');
  const [activeView, setActiveView] = useState<'status' | 'history' | 'settings'>('status');

  if (!repoPath) {
    return <div className="p-8">No repository path specified.</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar 
        activeView={activeView} 
        onChangeView={setActiveView} 
        repoPath={repoPath}
      />
      <main className="flex-1 p-6 overflow-auto">
        {activeView === 'status' && <StatusView repoPath={repoPath} />}
        {activeView === 'history' && <HistoryView repoPath={repoPath} />}
        {activeView === 'settings' && <div>Settings (To Be Implemented)</div>}
      </main>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
