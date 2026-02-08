
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitStatus, GitLog, Repository } from '@/lib/types';

const API_BASE = '/api';

export function useRepositories() {
  return useQuery<Repository[]>({
    queryKey: ['repos'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/repos`);
      if (!res.ok) throw new Error('Failed to fetch repositories');
      return res.json();
    },
  });
}

export function useAddRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, name }: { path: string; name?: string }) => {
      const res = await fetch(`${API_BASE}/repos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add repository');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });
}

export function useUpdateRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, updates }: { path: string; updates: Partial<Repository> }) => {
      const res = await fetch(`${API_BASE}/repos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, updates }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });
}

export function useDeleteRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const res = await fetch(`${API_BASE}/repos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });
}


export function useGitStatus(repoPath: string | null) {
  return useQuery<GitStatus>({
    queryKey: ['git', repoPath, 'status'],
    queryFn: async () => {
      if (!repoPath) return null;
      const res = await fetch(`${API_BASE}/git/status?path=${encodeURIComponent(repoPath)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const err = new Error(errorData.error || 'Failed to fetch status');
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!repoPath,
    refetchInterval: (query) => {
      // Stop polling if we have an error
      if (query.state.error) return false;
      return 2000;
    },
    retry: (failureCount, error: any) => {
      // Don't retry for 404 or 400 errors
      if (error.status === 404 || error.status === 400) return false;
      return failureCount < 3;
    },
  });
}

export function useGitLog(repoPath: string | null, limit: number = 50) {
  return useQuery<GitLog>({
    queryKey: ['git', repoPath, 'log', limit],
    queryFn: async () => {
      if (!repoPath) return null;
      const res = await fetch(`${API_BASE}/git/log?path=${encodeURIComponent(repoPath)}&limit=${limit}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const err = new Error(errorData.error || 'Failed to fetch log');
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!repoPath,
    placeholderData: (previousData) => previousData,
    retry: (failureCount, error: any) => {
      if (error.status === 404 || error.status === 400) return false;
      return failureCount < 3;
    },
  });
}

// ... UseGitLog ...

export interface BranchTrackingInfo {
  upstream: string;
  ahead: number;
  behind: number;
}

export function useGitBranches(repoPath: string | null) {
  return useQuery<{ 
    branches: string[], 
    current: string, 
    branchCommits: Record<string, string>, 
    remotes: Record<string, string[]>,
    remoteUrls: Record<string, string>,
    trackingInfo: Record<string, BranchTrackingInfo>
  }>({
    queryKey: ['git', repoPath, 'branches'],
    queryFn: async () => {
      if (!repoPath) return null;
      const res = await fetch(`${API_BASE}/git/branches?path=${encodeURIComponent(repoPath)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch branches');
      }
      return res.json();
    },
    enabled: !!repoPath,
  });
}

export function useGitDiff(repoPath: string | null, filePath: string | null) {
  return useQuery<{ diff: string; left: string; right: string }>({
    queryKey: ['git', repoPath, 'diff', filePath],
    queryFn: async () => {
      if (!repoPath || !filePath) return null;
      const res = await fetch(`${API_BASE}/git/diff?path=${encodeURIComponent(repoPath)}&file=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const err = new Error(errorData.error || 'Failed to fetch diff');
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!repoPath && !!filePath,
    retry: (failureCount, error: any) => {
      if (error.status === 404 || error.status === 400) return false;
      return failureCount < 3;
    },
  });
}

export interface CommitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export function useCommitDiff(repoPath: string | null, commitHash: string | null) {
  return useQuery<{ files: CommitFile[]; diff: string }>({
    queryKey: ['git', repoPath, 'commit-diff', commitHash],
    queryFn: async () => {
      if (!repoPath || !commitHash) return null;
      const res = await fetch(`${API_BASE}/git/diff?path=${encodeURIComponent(repoPath)}&commit=${encodeURIComponent(commitHash)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const err = new Error(errorData.error || 'Failed to fetch commit diff');
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!repoPath && !!commitHash,
    retry: (failureCount, error: any) => {
      if (error.status === 404 || error.status === 400) return false;
      return failureCount < 3;
    },
  });
}

export function useCommitFileDiff(repoPath: string | null, commitHash: string | null, filePath: string | null) {
  return useQuery<{ left: string; right: string }>({
    queryKey: ['git', repoPath, 'commit-file-diff', commitHash, filePath],
    queryFn: async () => {
      if (!repoPath || !commitHash || !filePath) return null;
      const res = await fetch(`${API_BASE}/git/diff?path=${encodeURIComponent(repoPath)}&commit=${encodeURIComponent(commitHash)}&file=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const err = new Error(errorData.error || 'Failed to fetch file diff');
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!repoPath && !!commitHash && !!filePath,
    retry: (failureCount, error: any) => {
      if (error.status === 404 || error.status === 400) return false;
      return failureCount < 3;
    },
  });
}

// Stash types
export interface GitStash {
  index: number;
  message: string;
  date: string;
  hash: string;
}

export function useGitStashes(repoPath: string | null) {
  return useQuery<GitStash[]>({
    queryKey: ['git', repoPath, 'stashes'],
    queryFn: async () => {
      if (!repoPath) return [];
      const res = await fetch(`${API_BASE}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, action: 'stash-list' }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch stashes');
      }
      const data = await res.json();
      return data.stashes || [];
    },
    enabled: !!repoPath,
  });
}

export interface StashFile {
  path: string;
  status: string;
}

export function useStashFiles(repoPath: string | null, stashIndex: number | null) {
  return useQuery<StashFile[]>({
    queryKey: ['git', repoPath, 'stash-files', stashIndex],
    queryFn: async () => {
      if (!repoPath || stashIndex === null) return [];
      const res = await fetch(`${API_BASE}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, action: 'stash-files', data: { index: stashIndex } }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch stash files');
      }
      const data = await res.json();
      return data.files || [];
    },
    enabled: !!repoPath && stashIndex !== null,
  });
}

export function useStashFileDiff(repoPath: string | null, stashIndex: number | null, filePath: string | null) {
  return useQuery<{ left: string; right: string }>({
    queryKey: ['git', repoPath, 'stash-file-diff', stashIndex, filePath],
    queryFn: async () => {
      if (!repoPath || stashIndex === null || !filePath) return { left: '', right: '' };
      const res = await fetch(`${API_BASE}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, action: 'stash-file-diff', data: { index: stashIndex, file: filePath } }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch stash file diff');
      }
      return res.json();
    },
    enabled: !!repoPath && stashIndex !== null && !!filePath,
  });
}

// Actions
export type GitActionType = 'commit' | 'push' | 'pull' | 'fetch' | 'stage' | 'unstage' | 'checkout' | 'branch' | 'delete-branch' | 'delete-remote-branch' | 'rename-branch' | 'rebase' | 'merge' | 'get-remotes' | 'get-remote-branches' | 'get-tracking-branch' | 'push-to-remote' | 'pull-from-remote' | 'stash' | 'stash-apply' | 'stash-drop' | 'stash-pop';

interface GitActionPayload {
  repoPath: string;
  action: GitActionType;
  data?: any;
}

export function useGitAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ repoPath, action, data }: GitActionPayload) => {
      const res = await fetch(`${API_BASE}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, action, data }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to execute action');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Don't invalidate for read-only actions
      const readOnlyActions = ['get-remotes', 'get-remote-branches', 'get-tracking-branch'];
      if (!readOnlyActions.includes(variables.action)) {
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['git', variables.repoPath] });
      }
    },
  });
}
