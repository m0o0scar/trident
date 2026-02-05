'use client';

import { useRepositories, useAddRepository } from '@/hooks/use-git';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { FolderPlus, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';

import { FileSystemBrowser } from './fs-browser';

export function RepoList() {
    const { data: repos, isLoading } = useRepositories();
    const addRepo = useAddRepository();
    const [newPath, setNewPath] = useState('');
    const [browserOpen, setBrowserOpen] = useState(false);
    const router = useRouter();

    const handleAdd = async (path: string) => {
        if (!path) return;
        try {
            await addRepo.mutateAsync({ path });
            setNewPath('');
        } catch (error) {
            alert('Failed to add repo');
        }
    };

    const manuallyAdd = (e: React.FormEvent) => {
        e.preventDefault();
        handleAdd(newPath);
    }

    if (isLoading) return <div>Loading repositories...</div>;

    return (
        <div className="container mx-auto p-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Git Web Client</h1>
                <ThemeToggle />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Add New Repo Card */}
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FolderPlus className="w-5 h-5" />
                            Open Repository
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4">
                        <Button variant="outline" className="w-full h-24 flex flex-col gap-2 border-dashed" onClick={() => setBrowserOpen(true)}>
                            <FolderOpen className="w-8 h-8 text-muted-foreground" />
                            <span>Browse System</span>
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">Or path</span>
                            </div>
                        </div>

                        <form onSubmit={manuallyAdd} className="flex gap-2">
                            <Input
                                placeholder="/path/to/repo"
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                            />
                            <Button type="submit">Add</Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Existing Repos */}
                {repos?.map((repo) => (
                    <Card key={repo.path} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/workspace?path=${encodeURIComponent(repo.path)}`)}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FolderOpen className="w-5 h-5" />
                                {repo.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-500 font-mono truncate" title={repo.path}>
                                {repo.path}
                            </p>
                        </CardContent>
                        <CardFooter>
                            <Button variant="secondary" className="w-full" asChild>
                                <Link href={`/workspace?path=${encodeURIComponent(repo.path)}`}>
                                    Open Workspace
                                </Link>
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <FileSystemBrowser
                open={browserOpen}
                onOpenChange={setBrowserOpen}
                onSelect={(path) => handleAdd(path)}
            />
        </div>
    );
}
