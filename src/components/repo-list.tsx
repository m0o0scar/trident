'use client';

import { useRepositories, useAddRepository, useDeleteRepository } from '@/hooks/use-git';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSystemBrowser } from './fs-browser';
import { toast } from '@/hooks/use-toast';
import { HomeSettingsModal } from './home-settings-modal';
import { getRepositoryDisplayName } from '@/lib/utils';

export function RepoList() {
    const { data: repos, isLoading } = useRepositories();
    const addRepo = useAddRepository();
    const deleteRepo = useDeleteRepository();
    const [browserOpen, setBrowserOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [repoToDelete, setRepoToDelete] = useState<{ path: string; displayName: string } | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [defaultRootFolder, setDefaultRootFolder] = useState<string | undefined>(undefined);
    const router = useRouter();

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    setDefaultRootFolder(data.resolvedDefaultFolder);
                }
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        };
        loadSettings();
    }, []);

    const handleAdd = async (path: string) => {
        if (!path) return;
        try {
            await addRepo.mutateAsync({ path });
            // Navigate to workspace page after successfully adding repository
            router.push(`/workspace?path=${encodeURIComponent(path)}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (errorMessage.includes('already exists')) {
                toast({
                    type: 'warning',
                    title: 'Repository already added',
                    description: 'This repository is already in your list. Select it from the list to open it.',
                });
            } else {
                toast({
                    type: 'error',
                    title: 'Failed to add repository',
                    description: errorMessage,
                });
            }
        }
    };

    const handleDeleteClick = (e: React.MouseEvent, repo: { path: string; displayName: string }) => {
        e.stopPropagation();
        setRepoToDelete(repo);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!repoToDelete) return;
        try {
            await deleteRepo.mutateAsync({ path: repoToDelete.path });
            setDeleteDialogOpen(false);
            setRepoToDelete(null);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toast({
                type: 'error',
                title: 'Failed to delete repository',
                description: errorMessage,
            });
        }
    };

    if (isLoading) return <div className="p-12 text-center opacity-70">Loading repositories...</div>;

    return (
        <div className="container mx-auto max-w-5xl py-12 px-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
                    <p className="text-sm opacity-70 mt-1">Manage your git repositories.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-square btn-ghost" onClick={() => setSettingsOpen(true)} title="Settings">
                        <i className="iconoir-settings text-[20px]" aria-hidden="true" />
                    </button>
                    <Link href="/credentials" className="btn gap-2">
                        <i className="iconoir-key text-[20px]" aria-hidden="true" />
                        Credentials
                    </Link>
                    <button onClick={() => setBrowserOpen(true)} className="btn btn-accent gap-2">
                        <i className="iconoir-plus-circle text-[20px]" aria-hidden="true" />
                        Add Repository
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto border border-base-300 rounded-lg bg-base-100">
                <table className="table w-full">
                    <thead className="bg-base-200/50">
                        <tr>
                            <th>Name</th>
                            <th>Path</th>
                            <th className="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {repos?.length === 0 && (
                            <tr>
                                <td colSpan={3} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <p>No repositories found.</p>
                                        <button className="btn btn-link" onClick={() => setBrowserOpen(true)}>Add your first repository</button>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {repos?.map((repo) => {
                            const repoDisplayName = getRepositoryDisplayName(repo);
                            return (
                            <tr
                                key={repo.path}
                                className="hover:bg-base-200/30 cursor-pointer group"
                                onClick={() => router.push(`/workspace?path=${encodeURIComponent(repo.path)}`)}
                            >
                                <td>
                                    <div className="flex items-center gap-3">
                                        <i className="iconoir-bookmark text-[20px] opacity-70 group-hover:text-primary transition-colors" aria-hidden="true" />
                                        <span className="font-bold text-sm">{repoDisplayName}</span>
                                    </div>
                                </td>
                                <td className="text-sm opacity-70 font-mono truncate max-w-xs" title={repo.path}>
                                    {repo.path}
                                </td>
                                <td className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <Link
                                            href={`/workspace?path=${encodeURIComponent(repo.path)}`}
                                            className="btn btn-ghost btn-sm btn-square"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <i className="iconoir-arrow-right text-[16px]" aria-hidden="true" />
                                        </Link>
                                        <button
                                            className="btn btn-ghost btn-sm btn-square text-error hover:bg-error/10"
                                            onClick={(e) => handleDeleteClick(e, { path: repo.path, displayName: repoDisplayName })}
                                        >
                                            <i className="iconoir-trash text-[16px]" aria-hidden="true" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <FileSystemBrowser
                open={browserOpen}
                onOpenChange={setBrowserOpen}
                onSelect={(path) => handleAdd(path)}
                initialPath={defaultRootFolder}
            />

            <HomeSettingsModal
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onSettingsChange={(settings) => setDefaultRootFolder(settings.resolvedDefaultFolder)}
            />

            {deleteDialogOpen && (
                <dialog className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg">Delete Repository</h3>
                        <p className="py-4 break-words">
                            Are you sure you want to remove <strong className="break-all">{repoToDelete?.displayName}</strong> from the list? 
                            This will only remove it from your repository list, not delete the files from your file system.
                        </p>
                        <div className="modal-action">
                            <button className="btn" onClick={() => setDeleteDialogOpen(false)}>Cancel</button>
                            <button className="btn btn-error" onClick={handleDeleteConfirm}>Delete</button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={() => setDeleteDialogOpen(false)}>close</button>
                    </form>
                </dialog>
            )}
        </div>
    );
}
