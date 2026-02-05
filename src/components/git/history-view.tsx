'use client';

import { useGitLog, useGitBranches } from '@/hooks/use-git';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { GitGraph } from './git-graph';
import { useState } from 'react';

export function HistoryView({ repoPath }: { repoPath: string }) {
  const [limit, setLimit] = useState(100);
  const { data: log, isLoading, isError, error, refetch, isFetching } = useGitLog(repoPath, limit);
  const { data: branchData } = useGitBranches(repoPath);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  if (isLoading && limit === 100) {
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin" /></div>;
  }

  if (isError) {
    // ... error handling
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
    <div className="flex h-[calc(100vh-100px)] gap-4">
      {/* Branch Sidebar */}
      <div className="w-64 flex flex-col border rounded-md bg-card">
        <div className="p-3 border-b font-medium text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Branches
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {branchData?.branches.map((branch) => (
              <div key={branch} className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted",
                branch === branchData.current && "bg-muted font-medium"
              )}>
                <GitBranch className="h-3 w-3 text-muted-foreground" />
                <span className="truncate flex-1">{branch}</span>
                {branch === branchData.current && <Badge variant="secondary" className="text-[10px] h-5 px-1">Current</Badge>}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Commit History</h1>
          <div className="text-xs text-muted-foreground">
            {log.all.length} commits {isFetching && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
          </div>
        </div>

        <div className="flex-1 overflow-hidden border rounded-md">
          <GitGraph
            commits={log.all}
            selectedHash={selectedHash || undefined}
            onSelectCommit={setSelectedHash}
            onEndReached={() => {
              if (!isFetching && log.all.length >= limit) {
                setLimit(l => l + 50);
              }
            }}
          />
        </div>

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
    </div>
  );
}
