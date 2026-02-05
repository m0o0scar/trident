'use client';

import { useGitLog } from '@/hooks/use-git';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw } from 'lucide-react';



import { GitGraph } from './git-graph';
import { useState } from 'react';

export function HistoryView({ repoPath }: { repoPath: string }) {
  const { data: log, isLoading, isError, error, refetch } = useGitLog(repoPath, 100); // Fetch more for graph
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin" /></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <span className="text-lg">Error Loading History</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'An unknown error occurred'}</p>
            <Button onClick={() => refetch()} variant="outline" className="w-full">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!log) return <div className="flex items-center justify-center p-8 h-full">No history data available</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Commit History</h1>
      </div>

      <div className="flex-1 overflow-hidden border rounded-md">
        <GitGraph
          commits={log.all}
          selectedHash={selectedHash || undefined}
          onSelectCommit={setSelectedHash}
        />
      </div>

      {/* Detail View (Optional, placeholder for now) */}
      {selectedHash && (
        <Card className="h-48 flex flex-col overflow-hidden p-0 gap-0">
          <CardHeader className="flex flex-row items-center py-3 px-4 border-b bg-card shrink-0 !pb-3">
            <CardTitle className="text-sm font-semibold leading-normal truncate">
              {log.all.find(c => c.hash === selectedHash)?.message}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4">
            <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
              {log.all.find(c => c.hash === selectedHash)?.body}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
