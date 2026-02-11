import { z } from 'zod';
import { GitService } from '@/lib/git';

export const actionSchema = z.object({
  repoPath: z.string(),
  action: z.enum([
    'commit', 'push', 'pull', 'stage', 'unstage', 'fetch',
    'checkout', 'checkout-to-local', 'branch', 'delete-branch', 'delete-remote-branch',
    'rename-branch', 'rename-remote-branch', 'reset', 'cherry-pick', 'cherry-pick-multiple',
    'cherry-pick-abort', 'rebase', 'merge', 'check-merge-conflicts', 'check-rebase-conflicts',
    'get-remotes', 'get-remote-branches', 'get-tracking-branch', 'push-to-remote', 'pull-from-remote',
    'stash', 'stash-list', 'stash-apply', 'stash-drop', 'stash-pop', 'stash-files', 'stash-file-diff',
    'reword', 'discard', 'cleanup-lock-file'
  ]),
  data: z.any().optional(), // Payload depends on action
});

export type ActionPayload = z.infer<typeof actionSchema>;

export type GitActionHandler = (
  repoPath: string,
  git: GitService,
  data: any
) => Promise<any>;
