'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';
import { useRepositories, useUpdateRepository, useGitBranches } from '@/hooks/use-git';
import { useCredentials, Credential } from '@/hooks/use-credentials';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

function getHostname(url: string): string | null {
  try {
    // Handle git@github.com:user/repo.git format
    if (url.startsWith('git@')) {
      const match = url.match(/git@([^:]+):/);
      return match ? match[1] : null;
    }
    // Handle https://github.com/user/repo.git format
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

function WorkspaceSettingsContent() {
    const searchParams = useSearchParams();
    const repoPath = searchParams.get('path');

    useWorkspaceTitle(repoPath);

    const { data: repos, isLoading: isLoadingRepos } = useRepositories();
    const { data: credentials, isLoading: isLoadingCreds } = useCredentials();
    const { data: gitData, isLoading: isLoadingGit } = useGitBranches(repoPath);
    const updateRepo = useUpdateRepository();

    const currentRepo = useMemo(() => 
        repos?.find(r => r.path === repoPath), 
    [repos, repoPath]);

    const matchingCredentials = useMemo(() => {
        if (!credentials || !gitData?.remoteUrls) return [];

        // specific remote URLs
        const urls = Object.values(gitData.remoteUrls);
        const remoteHosts = new Set(urls.map(getHostname).filter(Boolean) as string[]);

        return credentials.filter(cred => {
            if (cred.type === 'github') {
                return remoteHosts.has('github.com');
            }
            if (cred.type === 'gitlab' && cred.serverUrl) {
                const credHost = getHostname(cred.serverUrl);
                return credHost && remoteHosts.has(credHost);
            }
            return false;
        });
    }, [credentials, gitData]);

    const isLoading = isLoadingRepos || isLoadingCreds || isLoadingGit;

    if (isLoading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;
    }

    if (!repoPath || !currentRepo) {
        return <div className="p-8">Repository not found.</div>;
    }

    const handleCredentialChange = (credentialId: string) => {
        updateRepo.mutate({
            path: repoPath,
            updates: { credentialId: credentialId === 'none' ? null : credentialId }
        });
    };

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Workspace Settings</h1>
            
            <Card>
                <CardHeader>
                    <CardTitle>Repository Credentials</CardTitle>
                    <CardDescription>
                        Associate a credential with this repository to authenticate with remote servers.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="credential-select">Associated Credential</Label>
                        <Select 
                            value={currentRepo.credentialId || 'none'} 
                            onValueChange={handleCredentialChange}
                        >
                            <SelectTrigger id="credential-select">
                                <SelectValue placeholder="Select a credential" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {matchingCredentials.map((cred) => (
                                    <SelectItem key={cred.id} value={cred.id}>
                                        {cred.type === 'github' ? 'GitHub' : 'GitLab'} 
                                        {cred.type === 'gitlab' && ` (${new URL(cred.serverUrl!).hostname})`}
                                        {' - '}
                                        {cred.type === 'github' ? 'Account' : 'Token'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {matchingCredentials.length === 0 && (
                            <p className="text-sm text-muted-foreground mt-2">
                                No matching credentials found for this repository's remotes. 
                                Add credentials in the Credentials page.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function WorkspaceSettingsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>}>
            <WorkspaceSettingsContent />
        </Suspense>
    );
}