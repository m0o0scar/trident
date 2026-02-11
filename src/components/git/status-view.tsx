'use client';

import { useGitStatus, useGitAction } from '@/hooks/use-git';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { DiffView } from './diff-view';

const EMPTY_FILES: Array<{ path: string; index: string; working_dir: string }> = [];

interface StatusFileTreeNode {
    name: string;
    path: string;
    filePath?: string;
    children: Map<string, StatusFileTreeNode>;
}

function buildStatusFileTree(paths: string[]): StatusFileTreeNode {
    const root: StatusFileTreeNode = {
        name: '',
        path: '',
        children: new Map(),
    };

    for (const filePath of paths) {
        const parts = filePath.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    path: currentPath,
                    children: new Map(),
                });
            }

            current = current.children.get(part)!;

            if (i === parts.length - 1) {
                current.filePath = filePath;
            }
        }
    }

    return root;
}

function collectFolderPaths(node: StatusFileTreeNode): string[] {
    const paths: string[] = [];
    const children = Array.from(node.children.values());

    children.forEach((child) => {
        if (child.children.size > 0) {
            paths.push(child.path);
            paths.push(...collectFolderPaths(child));
        }
    });

    return paths;
}

function getParentPaths(filePath: string): string[] {
    const parts = filePath.split('/').filter(Boolean);
    const parentPaths: string[] = [];

    for (let i = 1; i < parts.length; i++) {
        parentPaths.push(parts.slice(0, i).join('/'));
    }

    return parentPaths;
}

function StatusFileTreeItem({
    node,
    selectedFile,
    expandedFolders,
    onToggleFolder,
    onSelectFile,
    onActionFile,
    actionType,
    actionPending,
    depth = 0,
}: {
    node: StatusFileTreeNode;
    selectedFile: string | null;
    expandedFolders: Set<string>;
    onToggleFolder: (path: string) => void;
    onSelectFile: (path: string) => void;
    onActionFile: (path: string) => Promise<void>;
    actionType: 'stage' | 'unstage';
    actionPending: boolean;
    depth?: number;
}) {
    const children = Array.from(node.children.values()).sort((a, b) => {
        const aIsFolder = a.children.size > 0;
        const bIsFolder = b.children.size > 0;

        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <>
            {children.map((child) => {
                const isFolder = child.children.size > 0;

                if (isFolder) {
                    const isExpanded = expandedFolders.has(child.path);

                    return (
                        <div key={child.path}>
                            <div
                                className="flex items-center gap-1 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-base-300 transition-colors opacity-80"
                                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                                onClick={() => onToggleFolder(child.path)}
                                title={child.path}
                            >
                                <span className="text-[10px] opacity-70">{isExpanded ? '▼' : '▶'}</span>
                                <i className="iconoir-folder text-[14px] opacity-70" aria-hidden="true" />
                                <span className="truncate flex-1">{child.name}</span>
                            </div>
                            {isExpanded && (
                                <StatusFileTreeItem
                                    node={child}
                                    selectedFile={selectedFile}
                                    expandedFolders={expandedFolders}
                                    onToggleFolder={onToggleFolder}
                                    onSelectFile={onSelectFile}
                                    onActionFile={onActionFile}
                                    actionType={actionType}
                                    actionPending={actionPending}
                                    depth={depth + 1}
                                />
                            )}
                        </div>
                    );
                }

                if (!child.filePath) return null;

                return (
                    <div
                        key={child.filePath}
                        className={cn(
                            'flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer group hover:bg-base-300 transition-colors text-sm',
                            selectedFile === child.filePath && 'bg-base-300 font-medium text-primary'
                        )}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={() => onSelectFile(child.filePath!)}
                        title={child.filePath}
                    >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <i className="iconoir-page text-[14px] opacity-70 shrink-0" aria-hidden="true" />
                            <span className="truncate flex-1 font-mono text-xs">{child.name}</span>
                        </div>
                        <button
                            className={cn(
                                'btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity',
                                actionType === 'stage'
                                    ? 'text-success hover:bg-success/10'
                                    : 'text-error hover:bg-error/10'
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                void onActionFile(child.filePath);
                            }}
                            disabled={actionPending}
                        >
                            <i
                                className={cn(
                                    'text-[14px]',
                                    actionType === 'stage' ? 'iconoir-plus-circle' : 'iconoir-minus-circle'
                                )}
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                );
            })}
        </>
    );
}

export function StatusView({ repoPath }: { repoPath: string }) {
    const { data: status, isLoading, isError, error, refetch } = useGitStatus(repoPath);
    const action = useGitAction();
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [stashDialogOpen, setStashDialogOpen] = useState(false);
    const [stashMessage, setStashMessage] = useState('');
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
    const [collapsedChangeFolders, setCollapsedChangeFolders] = useState<Set<string>>(new Set());
    const [collapsedStagedFolders, setCollapsedStagedFolders] = useState<Set<string>>(new Set());
    const files = status?.files ?? EMPTY_FILES;

    // Group files
    const { staged, changes } = useMemo(() => {
        const stagedFiles: string[] = [];
        const changedFiles: string[] = [];

        files.forEach((file) => {
            if (file.index !== ' ' && file.index !== '?') {
                stagedFiles.push(file.path);
            }
            if (file.working_dir !== ' ' || file.index === '?') {
                changedFiles.push(file.path);
            }
        });

        return {
            staged: stagedFiles,
            changes: changedFiles,
        };
    }, [files]);

    const changesTree = useMemo(() => buildStatusFileTree(changes), [changes]);
    const stagedTree = useMemo(() => buildStatusFileTree(staged), [staged]);
    const allChangeFolderPaths = useMemo(() => collectFolderPaths(changesTree), [changesTree]);
    const allStagedFolderPaths = useMemo(() => collectFolderPaths(stagedTree), [stagedTree]);

    const expandedChangeFolders = useMemo(() => {
        const expanded = new Set<string>();

        allChangeFolderPaths.forEach((path) => {
            if (!collapsedChangeFolders.has(path)) {
                expanded.add(path);
            }
        });

        if (selectedFile) {
            getParentPaths(selectedFile).forEach((path) => expanded.add(path));
        }

        return expanded;
    }, [allChangeFolderPaths, collapsedChangeFolders, selectedFile]);

    const expandedStagedFolders = useMemo(() => {
        const expanded = new Set<string>();

        allStagedFolderPaths.forEach((path) => {
            if (!collapsedStagedFolders.has(path)) {
                expanded.add(path);
            }
        });

        if (selectedFile) {
            getParentPaths(selectedFile).forEach((path) => expanded.add(path));
        }

        return expanded;
    }, [allStagedFolderPaths, collapsedStagedFolders, selectedFile]);

    const handleToggleChangeFolder = useCallback((path: string) => {
        setCollapsedChangeFolders((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const handleToggleStagedFolder = useCallback((path: string) => {
        setCollapsedStagedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

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

    if (isLoading) {
        return <div className="flex items-center justify-center h-64"><span className="loading loading-spinner text-base-content/50"></span></div>;
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center h-64 flex-col gap-4">
                <p className="text-error font-bold">Error Loading Status</p>
                <p className="text-sm opacity-70">{(error as Error)?.message || 'An unknown error occurred'}</p>
                <button onClick={() => refetch()} className="btn btn-outline btn-sm">
                    <i className="iconoir-refresh-circle text-[16px] mr-1" aria-hidden="true" />
                    Try Again
                </button>
            </div>
        );
    }

    if (!status) return <div className="flex items-center justify-center h-64 opacity-70">No status data available</div>;

    return (
        <div className="flex h-full overflow-hidden">
            {/* Left Panel: File List */}
            <div className="w-64 border-r border-base-300 flex flex-col bg-base-200/30">
                <div className="h-[57px] px-4 border-b border-base-300 flex items-center justify-between bg-base-100">
                    <h1 className="font-bold text-lg">Changes</h1>
                    <button className="btn btn-ghost btn-sm btn-square" onClick={() => refetch()} disabled={action.isPending} title="Refresh">
                        {action.isPending ? <span className="loading loading-spinner loading-xs"></span> : <i className="iconoir-refresh-circle text-[16px]" aria-hidden="true" />}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Unstaged Changes */}
                    <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-2 mb-1">
                            <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">Changes ({changes.length})</h3>
                            <div className="flex items-center gap-0.5">
                                {changes.length === 0 && staged.length > 0 ? (
                                    <button className="btn btn-ghost btn-xs btn-square" onClick={handleUnstageAll} title="Unstage All">
                                        <i className="iconoir-arrow-up text-[16px]" aria-hidden="true" />
                                    </button>
                                ) : (
                                    <button className="btn btn-ghost btn-xs btn-square" onClick={handleStageAll} disabled={changes.length === 0} title="Stage All">
                                        <i className="iconoir-arrow-down text-[16px]" aria-hidden="true" />
                                    </button>
                                )}
                                <button className="btn btn-ghost btn-xs btn-square" onClick={() => setStashDialogOpen(true)} disabled={changes.length === 0 && staged.length === 0} title="Stash">
                                    <i className="iconoir-download-square text-[16px]" aria-hidden="true" />
                                </button>
                                <button className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10" onClick={() => setDiscardDialogOpen(true)} disabled={changes.length === 0} title="Discard All">
                                    <i className="iconoir-trash text-[16px]" aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            {changes.length === 0 && <p className="px-2 py-2 text-xs opacity-50 italic">No changes</p>}
                            {changes.length > 0 && (
                                <StatusFileTreeItem
                                    node={changesTree}
                                    selectedFile={selectedFile}
                                    expandedFolders={expandedChangeFolders}
                                    onToggleFolder={handleToggleChangeFolder}
                                    onSelectFile={setSelectedFile}
                                    onActionFile={handleStage}
                                    actionType="stage"
                                    actionPending={action.isPending}
                                />
                            )}
                        </div>
                    </div>

                     <div className="h-px bg-base-300 mx-4 my-2" />

                    {/* Staged Changes */}
                    <div className="p-2">
                         <div className="flex items-center justify-between px-2 py-2 mb-1">
                            <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">Staged ({staged.length})</h3>
                        </div>
                        <div className="space-y-0.5">
                            {staged.length === 0 && <p className="px-2 py-2 text-xs opacity-50 italic">No staged changes</p>}
                            {staged.length > 0 && (
                                <StatusFileTreeItem
                                    node={stagedTree}
                                    selectedFile={selectedFile}
                                    expandedFolders={expandedStagedFolders}
                                    onToggleFolder={handleToggleStagedFolder}
                                    onSelectFile={setSelectedFile}
                                    onActionFile={handleUnstage}
                                    actionType="unstage"
                                    actionPending={action.isPending}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Commit Box */}
                <div className="p-4 border-t border-base-300 bg-base-100">
                    <textarea
                        placeholder="Commit message..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="textarea textarea-bordered w-full min-h-[80px] text-sm resize-none mb-3 font-sans"
                    />
                    <button className="btn btn-primary w-full btn-sm" onClick={handleCommit} disabled={staged.length === 0 || !message || action.isPending}>
                        {action.isPending ? <span className="loading loading-spinner loading-xs mr-2"></span> : <span className="mr-2">✅</span>}
                        Commit Changes
                    </button>
                </div>
            </div>

            {/* Right Panel: Diff View */}
            <div className="flex-1 flex flex-col bg-base-100 overflow-hidden">
                {selectedFile ? (
                    <div className="h-full flex flex-col">
                        <DiffView repoPath={repoPath} filePath={selectedFile} />
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                        <div className="p-8 rounded-full bg-base-200 mb-4 text-4xl">
                             <i className="iconoir-refresh-circle text-[32px]" aria-hidden="true" />
                        </div>
                        <p className="text-sm font-bold">Select a file to view changes</p>
                    </div>
                )}
            </div>

            {/* Stash Dialog */}
            {stashDialogOpen && (
                <dialog className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg">Stash Changes</h3>
                        <p className="py-4 opacity-70">Save your local modifications to a new stash entry.</p>
                        <div className="py-2">
                            <input
                                type="text"
                                placeholder="Stash message (optional)"
                                value={stashMessage}
                                onChange={(e) => setStashMessage(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleStash();
                                    }
                                }}
                                className="input input-bordered w-full"
                            />
                        </div>
                        <div className="modal-action">
                            <button className="btn" onClick={() => setStashDialogOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleStash} disabled={action.isPending}>
                                {action.isPending && <span className="loading loading-spinner loading-xs"></span>}
                                Stash
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={() => setStashDialogOpen(false)}>close</button>
                    </form>
                </dialog>
            )}

            {/* Discard Dialog */}
            {discardDialogOpen && (
                <dialog className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg">Discard Changes</h3>
                        <p className="py-4">
                            Are you sure you want to discard all unstaged changes? This action cannot be undone.
                        </p>
                        <div className="modal-action">
                            <button className="btn" onClick={() => setDiscardDialogOpen(false)}>Cancel</button>
                            <button className="btn btn-error" onClick={handleDiscard} disabled={action.isPending}>
                                {action.isPending && <span className="loading loading-spinner loading-xs"></span>}
                                Discard
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={() => setDiscardDialogOpen(false)}>close</button>
                    </form>
                </dialog>
            )}
        </div>
    );
}
