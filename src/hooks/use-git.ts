
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
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
    enabled: !!repoPath,
    refetchInterval: 2000, // Poll every 2 seconds
  });
}

export function useGitLog(repoPath: string | null, limit: number = 50) {
  return useQuery<GitLog>({
    queryKey: ['git', repoPath, 'log', limit],
    queryFn: async () => {
       if (!repoPath) return null;
      const res = await fetch(`${API_BASE}/git/log?path=${encodeURIComponent(repoPath)}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch log');
      return res.json();
    },
    enabled: !!repoPath,
  });
}

export function useGitDiff(repoPath: string | null, filePath: string | null) {
  return useQuery<{ diff: string }>({
    queryKey: ['git', repoPath, 'diff', filePath],
    queryFn: async () => {
      if (!repoPath || !filePath) return null;
      const res = await fetch(`${API_BASE}/git/diff?path=${encodeURIComponent(repoPath)}&file=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error('Failed to fetch diff');
      return res.json();
    },
    enabled: !!repoPath && !!filePath,
  });
}

// Actions
export type GitActionType = 'commit' | 'push' | 'pull' | 'fetch' | 'stage' | 'unstage';

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
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['git', variables.repoPath] });
    },
  });
}
