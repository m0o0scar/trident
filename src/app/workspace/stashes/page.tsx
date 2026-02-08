'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Loader2, Archive, RefreshCcw, Play, Trash2, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';
import { useGitStashes, useGitAction, useStashFiles, useStashFileDiff } from '@/hooks/use-git';
import { Button } from '@/components/ui/button';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import ReactDiffViewer from '@alexbruf/react-diff-viewer';
import '@alexbruf/react-diff-viewer/index.css';
import { useTheme } from 'next-themes';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// Check if content appears to be binary
function isBinaryContent(content: string): boolean {
    if (!content) return false;
    if (content.includes('\0')) return true;
    const sample = content.slice(0, 8192);
    let nonPrintable = 0;
    for (let i = 0; i < sample.length; i++) {
        const code = sample.charCodeAt(i);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            nonPrintable++;
        }
    }
    return sample.length > 0 && (nonPrintable / sample.length) > 0.1;
}

function StashDiffView({ repoPath, stashIndex, filePath }: { repoPath: string; stashIndex: number; filePath: string }) {
    const { data, isLoading } = useStashFileDiff(repoPath, stashIndex, filePath);
    const { resolvedTheme } = useTheme();
    const storageKey = 'git-web:diff-view-split';

    const [splitView, setSplitView] = useState(() => {
        if (typeof window === 'undefined') return true;
        try {
            const stored = localStorage.getItem(storageKey);
            return stored !== null ? JSON.parse(stored) : true;
        } catch {
            return true;
        }
    });

    if (isLoading) {
        return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin text-muted-foreground" /></div>;
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No diff available
            </div>
        );
    }

    const isBinary = isBinaryContent(data.left || '') || isBinaryContent(data.right || '');

    if (isBinary) {
        return (
            <div className="flex flex-col h-full bg-background">
                <div className="flex items-center justify-between px-4 h-[57px] border-b shrink-0 bg-background">
                    <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
                </div>
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    Binary file - diff not available
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex items-center justify-between px-4 h-[57px] border-b shrink-0 bg-background">
                <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
                <div className="flex items-center gap-2">
                    <Label htmlFor="split-view-stash" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer">Split View</Label>
                    <Switch
                        id="split-view-stash"
                        checked={splitView}
                        onCheckedChange={(checked) => {
                            setSplitView(checked);
                            try {
                                localStorage.setItem(storageKey, JSON.stringify(checked));
                            } catch { }
                        }}
                        className="scale-75 origin-right"
                    />
                </div>
            </div>
            <div className="flex-1 overflow-auto diff-viewer-wrapper">
                <ReactDiffViewer
                    oldValue={data.left || ''}
                    newValue={data.right || ''}
                    splitView={splitView}
                    useDarkTheme={resolvedTheme === 'dark'}
                    disableWordDiff={true}
                />
            </div>
        </div>
    );
}

function StashesContent() {
    const searchParams = useSearchParams();
    const repoPath = searchParams.get('path');
    const { data: stashes, isLoading, isError, error, refetch } = useGitStashes(repoPath);
    const action = useGitAction();
    const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [expandedStashes, setExpandedStashes] = useState<Set<number>>(new Set());

    const { data: stashFiles, isLoading: filesLoading } = useStashFiles(repoPath, selectedStashIndex);

    useWorkspaceTitle(repoPath);

    if (!repoPath) {
        return <div className="p-8">No repository path specified.</div>;
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center h-64 flex-col gap-4">
                <p className="text-destructive font-medium">Error Loading Stashes</p>
                <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'An unknown error occurred'}</p>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    Try Again
                </Button>
            </div>
        );
    }

    const handleApply = async (index: number) => {
        await action.mutateAsync({ repoPath, action: 'stash-apply', data: { index } });
        refetch();
    };

    const handlePop = async (index: number) => {
        await action.mutateAsync({ repoPath, action: 'stash-pop', data: { index } });
        setSelectedStashIndex(null);
        setSelectedFile(null);
        refetch();
    };

    const handleDrop = async (index: number) => {
        await action.mutateAsync({ repoPath, action: 'stash-drop', data: { index } });
        if (selectedStashIndex === index) {
            setSelectedStashIndex(null);
            setSelectedFile(null);
        }
        refetch();
    };

    const toggleStashExpanded = (index: number) => {
        const newExpanded = new Set(expandedStashes);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedStashes(newExpanded);
        setSelectedStashIndex(index);
        setSelectedFile(null);
    };

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'just now';
            if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
            if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            return date.toLocaleDateString();
        } catch {
            return dateString;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'A': return 'text-green-600';
            case 'D': return 'text-red-600';
            case 'M': return 'text-yellow-600';
            default: return 'text-muted-foreground';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'A': return 'Added';
            case 'D': return 'Deleted';
            case 'M': return 'Modified';
            default: return status;
        }
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* Left Panel: Stash List */}
            <div className="w-80 border-r flex flex-col bg-muted/10">
                <div className="p-4 border-b flex items-center justify-between bg-background">
                    <h1 className="font-semibold text-lg flex items-center gap-2">
                        <Archive className="h-5 w-5" />
                        Stashes
                    </h1>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={action.isPending} title="Refresh">
                        <RefreshCcw className={`w-4 h-4 ${action.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {!stashes || stashes.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-64">
                            <div className="p-8 rounded-full bg-muted/30 mb-4">
                                <Archive className="w-8 h-8 opacity-20" />
                            </div>
                            <p className="text-sm font-medium">No stashes</p>
                            <p className="text-xs text-muted-foreground mt-1">Stash changes from the Changes page</p>
                        </div>
                    ) : (
                        <div className="p-2">
                            {stashes.map((stash) => {
                                const isExpanded = expandedStashes.has(stash.index);
                                const isSelected = selectedStashIndex === stash.index;

                                return (
                                    <ContextMenu key={stash.hash}>
                                        <ContextMenuTrigger asChild>
                                            <div className="mb-1">
                                                <div
                                                    className={cn(
                                                        "p-2 rounded-md cursor-pointer transition-colors",
                                                        isSelected ? "bg-muted" : "hover:bg-muted/50"
                                                    )}
                                                    onClick={() => toggleStashExpanded(stash.index)}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <div className="mt-0.5">
                                                            {isExpanded ? (
                                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <span className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded">
                                                                    stash@{'{' + stash.index + '}'}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {formatDate(stash.date)}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-medium truncate" title={stash.message}>
                                                                {stash.message}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                onClick={(e) => { e.stopPropagation(); handlePop(stash.index); }}
                                                                disabled={action.isPending}
                                                                title="Pop stash"
                                                            >
                                                                <Play className="h-3 w-3" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 hover:text-destructive"
                                                                onClick={(e) => { e.stopPropagation(); handleDrop(stash.index); }}
                                                                disabled={action.isPending}
                                                                title="Delete stash"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Files list when expanded */}
                                                {isExpanded && isSelected && (
                                                    <div className="ml-6 mt-1 space-y-0.5">
                                                        {filesLoading ? (
                                                            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                                Loading files...
                                                            </div>
                                                        ) : stashFiles && stashFiles.length > 0 ? (
                                                            stashFiles.map((file) => (
                                                                <div
                                                                    key={file.path}
                                                                    className={cn(
                                                                        "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs",
                                                                        selectedFile === file.path ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                                                                    )}
                                                                    onClick={(e) => { e.stopPropagation(); setSelectedFile(file.path); }}
                                                                >
                                                                    <FileText className="h-3 w-3 shrink-0" />
                                                                    <span className="font-mono truncate flex-1" title={file.path}>{file.path}</span>
                                                                    <span className={cn("text-[10px] uppercase", getStatusColor(file.status))} title={getStatusLabel(file.status)}>
                                                                        {file.status}
                                                                    </span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="px-2 py-1 text-xs text-muted-foreground italic">
                                                                No files in stash
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            <ContextMenuItem onClick={() => handleApply(stash.index)}>
                                                <Play className="h-4 w-4 mr-2" />
                                                Apply (keep stash)
                                            </ContextMenuItem>
                                            <ContextMenuItem onClick={() => handlePop(stash.index)}>
                                                <Play className="h-4 w-4 mr-2" />
                                                Pop (apply and delete)
                                            </ContextMenuItem>
                                            <ContextMenuItem variant="destructive" onClick={() => handleDrop(stash.index)}>
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Diff View */}
            <div className="flex-1 flex flex-col bg-background overflow-hidden">
                {selectedStashIndex !== null && selectedFile ? (
                    <StashDiffView repoPath={repoPath} stashIndex={selectedStashIndex} filePath={selectedFile} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <div className="p-8 rounded-full bg-muted/30 mb-4">
                            <Archive className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-sm font-medium">
                            {selectedStashIndex !== null ? 'Select a file to view changes' : 'Select a stash to view files'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function WorkspaceStashesPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>}>
            <StashesContent />
        </Suspense>
    );
}
