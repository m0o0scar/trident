'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';
import { useGitStashes, useGitAction, useStashFiles, useStashFileDiff } from '@/hooks/use-git';
import { cn } from '@/lib/utils';
import ReactDiffViewer from '@alexbruf/react-diff-viewer';
import '@alexbruf/react-diff-viewer/index.css';
import { useTheme } from 'next-themes';

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

    const [renderAnyway, setRenderAnyway] = useState(false);

    // Reset renderAnyway when file or stash changes
    useEffect(() => {
        setRenderAnyway(false);
    }, [filePath, stashIndex]);

    if (isLoading) {
        return <div className="flex items-center justify-center p-8 h-full"><span className="loading loading-spinner text-base-content/50"></span></div>;
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center h-full opacity-50">
                No diff available
            </div>
        );
    }

    const isBinary = isBinaryContent(data.left || '') || isBinaryContent(data.right || '');

    if (isBinary) {
        return (
            <div className="flex flex-col h-full bg-base-100">
                <div className="flex items-center justify-between px-4 h-[57px] border-b border-base-300 shrink-0 bg-base-100">
                    <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
                </div>
                <div className="flex-1 flex items-center justify-center opacity-50">
                    Binary file - diff not available
                </div>
            </div>
        );
    }

    // Large file protection
    const MAX_DIFF_SIZE = 100 * 1024; // 100KB
    const MAX_DIFF_LINES = 3000;

    const leftContent = data.left || '';
    const rightContent = data.right || '';
    
    // Use actual diff for size and line count if available
    const contentSize = data.diff ? data.diff.length : (leftContent.length + rightContent.length);
    
    const lineCount = data.diff 
        ? data.diff.split('\n').filter(line => 
            (line.startsWith('+') || line.startsWith('-')) && 
            !line.startsWith('+++') && 
            !line.startsWith('---')
          ).length 
        : (leftContent.match(/\n/g) || []).length + (rightContent.match(/\n/g) || []).length;

    const isLargeDiff = (contentSize > MAX_DIFF_SIZE || lineCount > MAX_DIFF_LINES);

    return (
        <div className="flex flex-col h-full bg-base-100">
            <div className="flex items-center justify-between px-4 h-[57px] border-b border-base-300 shrink-0 bg-base-100">
                <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
                <div className="flex items-center gap-2">
                    <label htmlFor="split-view-stash" className="text-[10px] uppercase tracking-wider font-bold cursor-pointer opacity-70">Split View</label>
                    <input
                        type="checkbox"
                        id="split-view-stash"
                        checked={splitView}
                        onChange={(e) => {
                            setSplitView(e.target.checked);
                            try {
                                localStorage.setItem(storageKey, JSON.stringify(e.target.checked));
                            } catch { }
                        }}
                        className="toggle toggle-xs toggle-primary"
                    />
                </div>
            </div>
            <div className="flex-1 overflow-auto diff-viewer-wrapper">
                {isLargeDiff && !renderAnyway ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-4">
                        <span className="text-4xl text-warning">⚠️</span>
                        <div className="space-y-2">
                            <h3 className="font-bold text-lg">Large Diff Detected</h3>
                            <p className="opacity-70">
                                This diff is large ({Math.round(contentSize / 1024)}KB, ~{lineCount} lines) and may freeze your browser if rendered.
                            </p>
                        </div>
                        <button className="btn btn-outline" onClick={() => setRenderAnyway(true)}>
                            Show Diff Anyway
                        </button>
                    </div>
                ) : (
                    <ReactDiffViewer
                        oldValue={data.left || ''}
                        newValue={data.right || ''}
                        splitView={splitView}
                        useDarkTheme={resolvedTheme === 'dark'}
                        disableWordDiff={true}
                    />
                )}
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

    useWorkspaceTitle(repoPath, 'Stashes');

    if (!repoPath) {
        return <div className="p-8">No repository path specified.</div>;
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <span className="loading loading-spinner text-base-content/50"></span>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center h-64 flex-col gap-4">
                <p className="text-error font-medium">Error Loading Stashes</p>
                <p className="text-sm opacity-70">{(error as Error)?.message || 'An unknown error occurred'}</p>
                <button onClick={() => refetch()} className="btn btn-outline btn-sm">
                    🔄 Try Again
                </button>
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
            case 'A': return 'text-success';
            case 'D': return 'text-error';
            case 'M': return 'text-warning';
            default: return 'opacity-50';
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
            <div className="w-64 border-r border-base-300 flex flex-col bg-base-200/30">
                <div className="h-[57px] px-4 border-b border-base-300 flex items-center justify-between bg-base-100">
                    <h1 className="font-bold text-lg">Stashes</h1>
                    <button className="btn btn-ghost btn-sm btn-square" onClick={() => refetch()} disabled={action.isPending} title="Refresh">
                        {action.isPending ? <span className="loading loading-spinner loading-xs"></span> : <span>🔄</span>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {!stashes || stashes.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-50 h-64">
                            <div className="p-8 rounded-full bg-base-200 mb-4 text-4xl">
                                📦
                            </div>
                            <p className="text-sm font-bold">No stashes</p>
                            <p className="text-xs mt-1">Stash changes from the Changes page</p>
                        </div>
                    ) : (
                        <div className="p-2">
                            {stashes.map((stash) => {
                                const isExpanded = expandedStashes.has(stash.index);
                                const isSelected = selectedStashIndex === stash.index;

                                return (
                                    <div key={stash.hash} className="mb-1">
                                        <div
                                            className={cn(
                                                "p-2 rounded-md cursor-pointer transition-colors",
                                                isSelected ? "bg-base-200" : "hover:bg-base-200/50"
                                            )}
                                            onClick={() => toggleStashExpanded(stash.index)}
                                        >
                                            <div className="flex flex-col gap-1">
                                                {/* Row 1: ID and Buttons */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="opacity-50 text-[10px]">
                                                            {isExpanded ? '▼' : '▶'}
                                                        </div>
                                                        <span className="text-[10px] font-mono bg-base-300 px-1 py-0.5 rounded opacity-70">
                                                            stash@{'{' + stash.index + '}'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <div className="tooltip tooltip-left before:whitespace-normal before:max-w-[120px]" data-tip="Apply stash (keep)">
                                                            <button
                                                                className="btn btn-ghost btn-xs btn-square"
                                                                onClick={(e) => { e.stopPropagation(); handleApply(stash.index); }}
                                                                disabled={action.isPending}
                                                            >
                                                                ▶️
                                                            </button>
                                                        </div>
                                                        <div className="tooltip tooltip-left before:whitespace-normal before:max-w-[120px]" data-tip="Pop stash (apply and delete)">
                                                            <button
                                                                className="btn btn-ghost btn-xs btn-square"
                                                                onClick={(e) => { e.stopPropagation(); handlePop(stash.index); }}
                                                                disabled={action.isPending}
                                                            >
                                                                💥
                                                            </button>
                                                        </div>
                                                        <div className="tooltip tooltip-left before:whitespace-normal before:max-w-[120px]" data-tip="Delete stash">
                                                            <button
                                                                className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                                                                onClick={(e) => { e.stopPropagation(); handleDrop(stash.index); }}
                                                                disabled={action.isPending}
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Row 2: Message */}
                                                <div className="tooltip tooltip-bottom before:whitespace-normal before:max-w-[200px] w-full block text-left" data-tip={stash.message}>
                                                    <p className="text-xs font-bold truncate opacity-90 w-full">
                                                        {stash.message}
                                                    </p>
                                                </div>

                                                {/* Row 3: Metadata */}
                                                <div className="text-[10px] opacity-50">
                                                    {formatDate(stash.date)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Files list when expanded */}
                                        {isExpanded && isSelected && (
                                            <div className="ml-6 mt-1 space-y-0.5">
                                                {filesLoading ? (
                                                    <div className="flex items-center gap-2 px-2 py-1 text-xs opacity-50">
                                                        <span className="loading loading-spinner loading-xs"></span>
                                                        Loading files...
                                                    </div>
                                                ) : stashFiles && stashFiles.length > 0 ? (
                                                    stashFiles.map((file) => (
                                                        <div
                                                            key={file.path}
                                                            className={cn(
                                                                "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs",
                                                                selectedFile === file.path ? "bg-primary/10 text-primary font-bold" : "hover:bg-base-200/50"
                                                            )}
                                                            onClick={(e) => { e.stopPropagation(); setSelectedFile(file.path); }}
                                                        >
                                                            <span className="opacity-50">📄</span>
                                                            <span className="font-mono truncate flex-1" title={file.path}>{file.path}</span>
                                                            <span className={cn("text-[10px] uppercase font-bold", getStatusColor(file.status))} title={getStatusLabel(file.status)}>
                                                                {file.status}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="px-2 py-1 text-xs opacity-50 italic">
                                                        No files in stash
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Diff View */}
            <div className="flex-1 flex flex-col bg-base-100 overflow-hidden">
                {selectedStashIndex !== null && selectedFile ? (
                    <StashDiffView repoPath={repoPath} stashIndex={selectedStashIndex} filePath={selectedFile} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                        <div className="p-8 rounded-full bg-base-200 mb-4 text-4xl">
                            📦
                        </div>
                        <p className="text-sm font-bold">
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
        <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="loading loading-spinner"></span></div>}>
            <StashesContent />
        </Suspense>
    );
}
