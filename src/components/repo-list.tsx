'use client';

import { useRepositories, useAddRepository, useDeleteRepository } from '@/hooks/use-git';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FolderOpen, Plus, ArrowRight, Key, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileSystemBrowser } from './fs-browser';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function RepoList() {
    const { data: repos, isLoading } = useRepositories();
    const addRepo = useAddRepository();
    const deleteRepo = useDeleteRepository();
    const [browserOpen, setBrowserOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [repoToDelete, setRepoToDelete] = useState<{ path: string; name: string } | null>(null);
    const router = useRouter();

    const handleAdd = async (path: string) => {
        if (!path) return;
        try {
            await addRepo.mutateAsync({ path });
            // Navigate to workspace page after successfully adding repository
            router.push(`/workspace?path=${encodeURIComponent(path)}`);
        } catch {
            alert('Failed to add repo');
        }
    };

    const handleDeleteClick = (e: React.MouseEvent, repo: { path: string; name: string }) => {
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
        } catch {
            alert('Failed to delete repository');
        }
    };

    if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading repositories...</div>;

    return (
        <div className="container mx-auto max-w-5xl py-12 px-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your git repositories.</p>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Button variant="outline" asChild>
                        <Link href="/credentials" className="gap-2">
                            <Key className="w-4 h-4" />
                            Credentials
                        </Link>
                    </Button>
                    <Button onClick={() => setBrowserOpen(true)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Add Repository
                    </Button>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden bg-background">
                <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-6 py-3 bg-muted/40 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div>Name</div>
                    <div>Path</div>
                    <div className="text-right">Action</div>
                </div>

                <div className="divide-y">
                    {repos?.length === 0 && (
                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                            <p>No repositories found.</p>
                            <Button variant="link" onClick={() => setBrowserOpen(true)}>Add your first repository</Button>
                        </div>
                    )}

                    {repos?.map((repo) => (
                        <div
                            key={repo.path}
                            className="grid grid-cols-[1fr_2fr_auto] gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group cursor-pointer"
                            onClick={() => router.push(`/workspace?path=${encodeURIComponent(repo.path)}`)}
                        >
                            <div className="flex items-center gap-3">
                                <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                <span className="font-medium text-sm">{repo.name}</span>
                            </div>
                            <div className="text-sm text-muted-foreground font-mono truncate" title={repo.path}>
                                {repo.path}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground" 
                                    asChild
                                >
                                    <Link href={`/workspace?path=${encodeURIComponent(repo.path)}`}>
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer" 
                                    onClick={(e) => handleDeleteClick(e, repo)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <FileSystemBrowser
                open={browserOpen}
                onOpenChange={setBrowserOpen}
                onSelect={(path) => handleAdd(path)}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Repository</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove <strong>{repoToDelete?.name}</strong> from the list? 
                            This will only remove it from your repository list, not delete the files from your file system.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
