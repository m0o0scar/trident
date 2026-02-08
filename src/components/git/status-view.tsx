'use client';

import { useGitStatus, useGitAction } from '@/hooks/use-git';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Loader2, Plus, Minus, RefreshCcw, Check, Archive, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiffView } from './diff-view';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export function StatusView({ repoPath }: { repoPath: string }) {
    const { data: status, isLoading, isError, error, refetch } = useGitStatus(repoPath);
    const action = useGitAction();
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [stashDialogOpen, setStashDialogOpen] = useState(false);
    const [stashMessage, setStashMessage] = useState('');
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

    if (isLoading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-muted-foreground" /></div>;
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center h-64 flex-col gap-4">
                <p className="text-destructive font-medium">Error Loading Status</p>
                <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'An unknown error occurred'}</p>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    Try Again
                </Button>
            </div>
        );
    }

    if (!status) return <div className="flex items-center justify-center h-64 text-muted-foreground">No status data available</div>;

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

    const handleUnstageAll = async () => {
        await action.mutateAsync({ repoPath, action: 'unstage', data: { files: staged } });
    }

    const handleStash = async () => {
        await action.mutateAsync({ repoPath, action: 'stash', data: { message: stashMessage || undefined } });
        setStashDialogOpen(false);
        setStashMessage('');
        setSelectedFile(null);
    }

    const handleDiscard = async () => {
        // Reset all changes (staged and unstaged)
        await action.mutateAsync({ repoPath, action: 'checkout', data: { branch: '.' } });
        setDiscardDialogOpen(false);
        setSelectedFile(null);
    }

    const handleCommit = async () => {
        if (!message) return;
        await action.mutateAsync({ repoPath, action: 'commit', data: { message } });
        setMessage('');
        setSelectedFile(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (staged.length > 0 && message && !action.isPending) {
                handleCommit();
            }
        }
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* Left Panel: File List */}
            <div className="w-80 border-r flex flex-col bg-muted/10">
                <div className="p-4 border-b flex items-center justify-between bg-background">
                    <h1 className="font-semibold text-lg">Changes</h1>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={action.isPending} title="Refresh">
                        <RefreshCcw className={`w-4 h-4 ${action.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Unstaged Changes */}
                    <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-2 mb-1">
                            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Changes ({changes.length})</h3>
                            <div className="flex items-center gap-1">
                                {changes.length === 0 && staged.length > 0 ? (
                                    <Button variant="ghost" size="xs" onClick={handleUnstageAll} className="h-5 text-[10px] px-2">Unstage All</Button>
                                ) : (
                                    <Button variant="ghost" size="xs" onClick={handleStageAll} className="h-5 text-[10px] px-2" disabled={changes.length === 0}>Stage All</Button>
                                )}
                                <Button variant="ghost" size="xs" onClick={() => setStashDialogOpen(true)} className="h-5 text-[10px] px-2" disabled={changes.length === 0 && staged.length === 0}>
                                    <Archive className="h-3 w-3 mr-1" />
                                    Stash
                                </Button>
                                <Button variant="ghost" size="xs" onClick={() => setDiscardDialogOpen(true)} className="h-5 text-[10px] px-2 hover:text-destructive" disabled={changes.length === 0}>
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Discard
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            {changes.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground italic">No changes</p>}
                            {changes.map(path => (
                                <div
                                    key={path}
                                    className={cn(
                                        "flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group hover:bg-muted/50 transition-colors text-sm",
                                        selectedFile === path && "bg-muted font-medium text-primary"
                                    )}
                                    onClick={() => setSelectedFile(path)}
                                >
                                    <span className="truncate flex-1 font-mono text-xs" title={path}>{path}</span>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30" onClick={(e) => { e.stopPropagation(); handleStage(path); }}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                     <div className="h-px bg-border mx-4 my-2" />

                    {/* Staged Changes */}
                    <div className="p-2">
                         <div className="flex items-center justify-between px-2 py-2 mb-1">
                            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Staged ({staged.length})</h3>
                        </div>
                        <div className="space-y-0.5">
                            {staged.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground italic">No staged changes</p>}
                            {staged.map(path => (
                                <div
                                    key={path}
                                    className={cn(
                                        "flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group hover:bg-muted/50 transition-colors text-sm",
                                        selectedFile === path && "bg-muted font-medium text-primary"
                                    )}
                                    onClick={() => setSelectedFile(path)}
                                >
                                    <span className="truncate flex-1 font-mono text-xs" title={path}>{path}</span>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleUnstage(path); }}>
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Commit Box */}
                <div className="p-4 border-t bg-background">
                    <Textarea
                        placeholder="Commit message..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="min-h-[80px] text-sm resize-none mb-3 bg-muted/20 focus:bg-background transition-colors"
                    />
                    <Button className="w-full" size="sm" onClick={handleCommit} disabled={staged.length === 0 || !message || action.isPending}>
                        {action.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                        Commit Changes
                    </Button>
                </div>
            </div>

            {/* Right Panel: Diff View */}
            <div className="flex-1 flex flex-col bg-background overflow-hidden">
                {selectedFile ? (
                    <div className="h-full flex flex-col">
                        <DiffView repoPath={repoPath} filePath={selectedFile} />
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <div className="p-8 rounded-full bg-muted/30 mb-4">
                             <RefreshCcw className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-sm font-medium">Select a file to view changes</p>
                    </div>
                )}
            </div>

            {/* Stash Dialog */}
            <Dialog open={stashDialogOpen} onOpenChange={setStashDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Stash Changes</DialogTitle>
                        <DialogDescription>
                            Save your local modifications to a new stash entry.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Stash message (optional)"
                            value={stashMessage}
                            onChange={(e) => setStashMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleStash();
                                }
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStashDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleStash} disabled={action.isPending}>
                            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                            Stash
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Discard Dialog */}
            <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Discard Changes</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to discard all unstaged changes? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDiscardDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDiscard} disabled={action.isPending}>
                            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                            Discard
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
