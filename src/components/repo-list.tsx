'use client';

import { useRepositories, useAddRepository } from '@/hooks/use-git';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FolderOpen, Plus, ArrowRight, Key } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileSystemBrowser } from './fs-browser';

export function RepoList() {
    const { data: repos, isLoading } = useRepositories();
    const addRepo = useAddRepository();
    const [browserOpen, setBrowserOpen] = useState(false);
    const router = useRouter();

    const handleAdd = async (path: string) => {
        if (!path) return;
        try {
            await addRepo.mutateAsync({ path });
        } catch {
            alert('Failed to add repo');
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
                            <div className="text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground" asChild>
                                    <Link href={`/workspace?path=${encodeURIComponent(repo.path)}`}>
                                        <ArrowRight className="w-4 h-4 group-hover:text-foreground transition-colors" />
                                    </Link>
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
        </div>
    );
}
