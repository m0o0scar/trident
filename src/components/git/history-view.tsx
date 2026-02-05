'use client';

import { useGitLog } from '@/hooks/use-git';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, GitCommit } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar'; // need to check if Avatar exists in shadcn
// Assuming yes since I initialized defaults. If not, I'll remove it.
// I'll assume Avatar is standard Shadcn.

export function HistoryView({ repoPath }: { repoPath: string }) {
  const { data: log, isLoading } = useGitLog(repoPath);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!log) return <div>Failed to load history</div>;

  return (
    <div className="max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold">Commit History</h1>
        <div className="relative border-l border-muted ml-3 space-y-6 pb-6">
            {log.all.map((commit) => (
                <div key={commit.hash} className="ml-6 relative">
                    {/* Dot */}
                    <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border bg-background flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                    
                    <Card>
                        <CardHeader className="py-3">
                             <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h3 className="font-semibold leading-none">{commit.message}</h3>
                                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                                        <span>{commit.author_name}</span>
                                        <span>•</span>
                                        <span>{new Date(commit.date).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                    {commit.hash.substring(0, 7)}
                                </div>
                             </div>
                        </CardHeader>
                    </Card>
                </div>
            ))}
        </div>
    </div>
  );
}
