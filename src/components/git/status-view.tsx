'use client';

import { useGitStatus, useGitAction } from '@/hooks/use-git';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DiffView } from './diff-view';

export function StatusView({ repoPath }: { repoPath: string }) {
    const { data: status, isLoading, isError, error, refetch } = useGitStatus(repoPath);
    const action = useGitAction();
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [stashDialogOpen, setStashDialogOpen] = useState(false);
    const [stashMessage, setStashMessage] = useState('');
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

    if (isLoading) {
        return <div className="flex items-center justify-center h-64"><span className="loading loading-spinner text-base-content/50"></span></div>;
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center h-64 flex-col gap-4">
                <p className="text-error font-bold">Error Loading Status</p>
                <p className="text-sm opacity-70">{(error as Error)?.message || 'An unknown error occurred'}</p>
                <button onClick={() => refetch()} className="btn btn-outline btn-sm">
                    🔄 Try Again
                </button>
            </div>
        );
    }

    if (!status) return <div className="flex items-center justify-center h-64 opacity-70">No status data available</div>;

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
            <div className="w-64 border-r border-base-300 flex flex-col bg-base-200/30">
                <div className="h-[57px] px-4 border-b border-base-300 flex items-center justify-between bg-base-100">
                    <h1 className="font-bold text-lg">Changes</h1>
                    <button className="btn btn-ghost btn-sm btn-square" onClick={() => refetch()} disabled={action.isPending} title="Refresh">
                        {action.isPending ? <span className="loading loading-spinner loading-xs"></span> : <span>🔄</span>}
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
                                        ⬆️
                                    </button>
                                ) : (
                                    <button className="btn btn-ghost btn-xs btn-square" onClick={handleStageAll} disabled={changes.length === 0} title="Stage All">
                                        ⬇️
                                    </button>
                                )}
                                <button className="btn btn-ghost btn-xs btn-square" onClick={() => setStashDialogOpen(true)} disabled={changes.length === 0 && staged.length === 0} title="Stash">
                                    📦
                                </button>
                                <button className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10" onClick={() => setDiscardDialogOpen(true)} disabled={changes.length === 0} title="Discard All">
                                    🗑️
                                </button>
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            {changes.length === 0 && <p className="px-2 py-2 text-xs opacity-50 italic">No changes</p>}
                            {changes.map(path => (
                                <div
                                    key={path}
                                    className={cn(
                                        "flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group hover:bg-base-300 transition-colors text-sm",
                                        selectedFile === path && "bg-base-300 font-medium text-primary"
                                    )}
                                    onClick={() => setSelectedFile(path)}
                                >
                                    <span className="truncate flex-1 font-mono text-xs" title={path}>{path}</span>
                                    <button className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 text-success hover:bg-success/10" onClick={(e) => { e.stopPropagation(); handleStage(path); }}>
                                        ➕
                                    </button>
                                </div>
                            ))}
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
                            {staged.map(path => (
                                <div
                                    key={path}
                                    className={cn(
                                        "flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group hover:bg-base-300 transition-colors text-sm",
                                        selectedFile === path && "bg-base-300 font-medium text-primary"
                                    )}
                                    onClick={() => setSelectedFile(path)}
                                >
                                    <span className="truncate flex-1 font-mono text-xs" title={path}>{path}</span>
                                    <button className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 text-error hover:bg-error/10" onClick={(e) => { e.stopPropagation(); handleUnstage(path); }}>
                                        ➖
                                    </button>
                                </div>
                            ))}
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
                             🔄
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
