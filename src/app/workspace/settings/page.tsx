'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { useWorkspaceTitle } from '@/hooks/use-workspace-title';
import { useRepositories, useUpdateRepository, useGitBranches } from '@/hooks/use-git';
import { useCredentials } from '@/hooks/use-credentials';

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

    useWorkspaceTitle(repoPath, 'Settings');

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
        return <div className="flex items-center justify-center h-full"><span className="loading loading-spinner"></span></div>;
    }

    if (!repoPath || !currentRepo) {
        return <div className="p-8">Repository not found.</div>;
    }

    const handleCredentialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const credentialId = e.target.value;
        updateRepo.mutate({
            path: repoPath,
            updates: { credentialId: credentialId === 'none' ? null : credentialId }
        });
    };

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Workspace Settings</h1>
            
            <div className="card bg-base-100 shadow-xl border border-base-200">
                <div className="card-body">
                    <h2 className="card-title">Repository Credentials</h2>
                    <p className="text-sm opacity-70">
                        Associate a credential with this repository to authenticate with remote servers.
                    </p>

                    <div className="form-control w-full mt-4">
                        <label className="label">
                            <span className="label-text">Associated Credential</span>
                        </label>
                        <select
                            className="select select-bordered w-full"
                            value={currentRepo.credentialId || 'none'} 
                            onChange={handleCredentialChange}
                        >
                            <option value="none">None</option>
                            {matchingCredentials.map((cred) => (
                                <option key={cred.id} value={cred.id}>
                                    {cred.type === 'github' ? 'GitHub' : 'GitLab'}
                                    {cred.type === 'gitlab' && ` (${new URL(cred.serverUrl!).hostname})`}
                                    {' - '}
                                    {cred.type === 'github' ? 'Account' : 'Token'}
                                </option>
                            ))}
                        </select>
                        {matchingCredentials.length === 0 && (
                            <label className="label">
                                <span className="label-text-alt opacity-70">
                                    No matching credentials found for this repository's remotes.
                                    Add credentials in the Credentials page.
                                </span>
                            </label>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function WorkspaceSettingsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="loading loading-spinner"></span></div>}>
            <WorkspaceSettingsContent />
        </Suspense>
    );
}
