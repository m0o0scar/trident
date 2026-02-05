'use client';

import { useGitStatus, useGitAction } from '@/hooks/use-git';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { Loader2, Plus, Minus, RefreshCcw } from 'lucide-react';
import { GitStatus } from '@/lib/types';


import { DiffView } from './diff-view';
import { cn } from '@/lib/utils';

export function StatusView({ repoPath }: { repoPath: string }) {
    const { data: status, isLoading, isError, error, refetch } = useGitStatus(repoPath);
    const action = useGitAction();
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);

    if (isLoading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center h-64">
                <Card className="w-full max-w-md border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center gap-2">
                            <span className="text-lg">Error Loading Status</span>
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

    if (!status) return <div className="flex items-center justify-center h-64">No status data available</div>;

    // Group files
    const staged: string[] = [];
    const changes: string[] = [];

    status.files.forEach(file => {
        if (file.index !== ' ' && file.index !== '?') {
            staged.push(file.path);
        }
        if (file.working_dir !== ' ' || file.index === '?') {
            changes.push(file.path);
        }
    });

    const handleStage = async (file: string) => {
        await action.mutateAsync({ repoPath, action: 'stage', data: { files: [file] } });
    };

    const handleUnstage = async (file: string) => {
        await action.mutateAsync({ repoPath, action: 'unstage', data: { files: [file] } });
    };

    const handleStageAll = async () => {
        await action.mutateAsync({ repoPath, action: 'stage', data: { files: ['.'] } });
    }

    const handleCommit = async () => {
        if (!message) return;
        await action.mutateAsync({ repoPath, action: 'commit', data: { message } });
        setMessage('');
        setSelectedFile(null);
    };

    return (
        <div className="flex gap-6 h-[calc(100vh-100px)]">
            {/* Left Panel: File List */}
            <div className="w-1/3 flex flex-col gap-6 overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-bold">Uncommitted Changes</h1>
                    <Button variant="outline" size="icon" onClick={() => refetch()} disabled={action.isPending} title="Refresh">
                        <RefreshCcw className={`w-4 h-4 ${action.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Unstaged Changes */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3">
                        <CardTitle className="text-sm font-semibold">Changes ({changes.length})</CardTitle>
                        <Button variant="ghost" size="xs" onClick={handleStageAll} className="h-6 text-xs">Stage All</Button>
                    </CardHeader>
                    <CardContent className="space-y-1 p-2">
                        {changes.length === 0 && <p className="text-muted-foreground text-xs p-2">No changes.</p>}
                        {changes.map(path => (
                            <div
                                key={path}
                                className={cn(
                                    "flex items-center justify-between p-2 rounded cursor-pointer group hover:bg-muted/50 transition-colors",
                                    selectedFile === path && "bg-muted"
                                )}
                                onClick={() => setSelectedFile(path)}
                            >
                                <span className="text-xs font-mono truncate flex-1" title={path}>{path}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleStage(path); }}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Staged Changes */}
                <Card>
                    <CardHeader className="p-3">
                        <CardTitle className="text-sm font-semibold">Staged ({staged.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 p-2">
                        {staged.length === 0 && <p className="text-muted-foreground text-xs p-2">No staged changes.</p>}
                        {staged.map(path => (
                            <div
                                key={path}
                                className={cn(
                                    "flex items-center justify-between p-2 rounded cursor-pointer group hover:bg-muted/50 transition-colors",
                                    selectedFile === path && "bg-muted"
                                )}
                                onClick={() => setSelectedFile(path)}
                            >
                                <span className="text-xs font-mono truncate flex-1" title={path}>{path}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={(e) => { e.stopPropagation(); handleUnstage(path); }}>
                                    <Minus className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Commit Box */}
                <Card className="mt-auto">
                    <CardContent className="p-3 space-y-2">
                        <Textarea
                            placeholder="Commit message..."
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            className="min-h-[80px] text-sm"
                        />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={handleCommit} disabled={staged.length === 0 || !message || action.isPending}>
                                {action.isPending ? 'Go...' : 'Commit'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Right Panel: Diff View */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedFile ? (
                    <div className="h-full flex flex-col">

                        <div className="flex-1 overflow-auto border rounded-md">
                            <DiffView repoPath={repoPath} filePath={selectedFile} />
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground border border-dashed rounded-md">
                        Select a file to view diff
                    </div>
                )}
            </div>
        </div>
    );
}
