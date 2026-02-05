'use client';

import { useRepositories, useAddRepository } from '@/hooks/use-git';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import {  FolderPlus, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function RepoList() {
  const { data: repos, isLoading } = useRepositories();
  const addRepo = useAddRepository();
  const [newPath, setNewPath] = useState('');
  const router = useRouter();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath) return;
    try {
        await addRepo.mutateAsync({ path: newPath });
        setNewPath('');
    } catch (error) {
        alert('Failed to add repo');
    }
  };

  if (isLoading) return <div>Loading repositories...</div>;

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Git Web Client</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Add New Repo Card */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FolderPlus className="w-5 h-5" />
                    Open Repository
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleAdd} className="flex gap-2">
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
    </div>
  );
}
