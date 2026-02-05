'use client';

import { useGitLog } from '@/hooks/use-git';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, GitCommit } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar'; // need to check if Avatar exists in shadcn
// Assuming yes since I initialized defaults. If not, I'll remove it.
// I'll assume Avatar is standard Shadcn.


import { GitGraph } from './git-graph';
import { useState } from 'react';

export function HistoryView({ repoPath }: { repoPath: string }) {
  const { data: log, isLoading } = useGitLog(repoPath, 100); // Fetch more for graph
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin" /></div>;
  }

  if (!log) return <div>Failed to load history</div>;

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
             <Card className="h-32 overflow-auto">
                <CardHeader className="py-2">
                    <CardTitle className="text-sm">Selected Commit: {selectedHash}</CardTitle>
                </CardHeader>
                <CardContent>
                     {/* We could show fuller details or diff here */}
                     <p className="text-xs text-muted-foreground">{log.all.find(c => c.hash === selectedHash)?.body}</p>
                </CardContent>
             </Card>
        )}
    </div>
  );
}
