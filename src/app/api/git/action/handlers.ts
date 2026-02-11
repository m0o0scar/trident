import { GitService } from '@/lib/git';
import { GitActionHandler } from './types';
import { resolveCredentials, toImageSide } from './utils';
import { isImageFile, getImageMimeType } from '@/lib/utils';

export const handlers: Record<string, GitActionHandler> = {
  commit: async (repoPath, git, data) => {
    if (!data?.message) throw new Error('Commit message is required');
    await git.commit(data.message, data.files);
  },

  push: async (repoPath, git, data) => {
    // Try to resolve credentials
    let pushCredentials = await resolveCredentials(repoPath, git, undefined);

    if (!pushCredentials) {
        // If no associated credential, try to infer from upstream
        try {
            const status = await git.getBranches();
            const current = status.current;
            if (current) {
                const tracking = status.trackingInfo[current];
                if (tracking && tracking.upstream) {
                    const slashIndex = tracking.upstream.indexOf('/');
                    if (slashIndex > 0) {
                        const remoteName = tracking.upstream.slice(0, slashIndex);
                        pushCredentials = await resolveCredentials(repoPath, git, remoteName);
                    }
                }
            }
        } catch (e) {
            // Ignore errors finding upstream, just proceed without creds
            console.warn('[API] Failed to resolve upstream for push credentials:', e);
        }
    }

    await git.push({ credentials: pushCredentials });
  },

  pull: async (repoPath, git, data) => {
    await git.pull();
  },

  fetch: async (repoPath, git, data) => {
    if (data?.allRemotes) {
      await git.fetchAllRemotes();
    } else if (data?.remote) {
      await git.fetchRemote(data.remote);
    } else {
      await git.fetch();
    }
  },

  stage: async (repoPath, git, data) => {
    if (!data?.files) throw new Error('Files are required for staging');
    await git.stage(data.files);
  },

  unstage: async (repoPath, git, data) => {
    if (!data?.files) throw new Error('Files are required for unstaging');
    await git.unstage(data.files);
  },

  discard: async (repoPath, git, data) => {
    await git.discardUnstagedChanges({
      includeUntracked: data?.includeUntracked ?? true,
    });
  },

  checkout: async (repoPath, git, data) => {
    if (!data?.branch) throw new Error('Branch name is required for checkout');
    await git.checkout(data.branch);
  },

  'checkout-to-local': async (repoPath, git, data) => {
    if (!data?.remoteBranch) throw new Error('Remote branch is required for checkout-to-local');
    if (!data?.localBranch) throw new Error('Local branch name is required for checkout-to-local');
    await git.checkoutRemoteToLocal(data.remoteBranch, data.localBranch);
  },

  branch: async (repoPath, git, data) => {
    if (!data?.branch) throw new Error('Branch name is required to create branch');
    await git.createBranch(data.branch, data?.fromRef);
  },

  'delete-branch': async (repoPath, git, data) => {
    if (!data?.branch) throw new Error('Branch name is required to delete branch');
    await git.deleteBranch(data.branch);
  },

  'delete-remote-branch': async (repoPath, git, data) => {
    if (!data?.remote) throw new Error('Remote name is required to delete remote branch');
    if (!data?.branch) throw new Error('Branch name is required to delete remote branch');

    const deleteCreds = await resolveCredentials(repoPath, git, data.remote);
    await git.deleteRemoteBranch(data.remote, data.branch, deleteCreds);
  },

  'rename-branch': async (repoPath, git, data) => {
    if (!data?.oldName) throw new Error('Old branch name is required to rename branch');
    if (!data?.newName) throw new Error('New branch name is required to rename branch');
    if (data?.renameTrackingRemote) {
      const tracking = await git.getTrackingBranch(data.oldName);
      const renameTrackingCreds = tracking
        ? await resolveCredentials(repoPath, git, tracking.remote)
        : undefined;
      await git.renameBranch(data.oldName, data.newName, {
        renameTrackingRemote: true,
        credentials: renameTrackingCreds,
      });
    } else {
      await git.renameBranch(data.oldName, data.newName);
    }
  },

  'rename-remote-branch': async (repoPath, git, data) => {
    if (!data?.remote) throw new Error('Remote name is required to rename remote branch');
    if (!data?.oldName) throw new Error('Old branch name is required to rename remote branch');
    if (!data?.newName) throw new Error('New branch name is required to rename remote branch');

    const renameCreds = await resolveCredentials(repoPath, git, data.remote);
    await git.renameRemoteBranch(data.remote, data.oldName, data.newName, renameCreds);
  },

  reset: async (repoPath, git, data) => {
    if (!data?.commitHash) throw new Error('Commit hash is required for reset');
    await git.reset(data.commitHash, data.mode ?? 'hard');
  },

  'cherry-pick': async (repoPath, git, data) => {
    if (!data?.commitHash) throw new Error('Commit hash is required for cherry-pick');
    await git.cherryPick(data.commitHash);
  },

  'cherry-pick-multiple': async (repoPath, git, data) => {
    if (!Array.isArray(data?.commitHashes) || data.commitHashes.length === 0) {
      throw new Error('Commit hashes are required for multi cherry-pick');
    }
    if (!data.commitHashes.every((hash: unknown) => typeof hash === 'string' && hash.trim().length > 0)) {
      throw new Error('All commit hashes must be non-empty strings');
    }
    await git.cherryPickMultiple(data.commitHashes);
  },

  'cherry-pick-abort': async (repoPath, git, data) => {
    await git.abortCherryPick();
  },

  rebase: async (repoPath, git, data) => {
    if (!data?.ontoBranch) throw new Error('Target branch is required for rebase');
    await git.rebase(data.ontoBranch, data.stashChanges ?? true);
  },

  reword: async (repoPath, git, data) => {
    if (!data?.commitHash) throw new Error('Commit hash is required for reword');
    if (!data?.message) throw new Error('New message is required for reword');
    await git.reword(data.commitHash, data.message, data.branch);
  },

  merge: async (repoPath, git, data) => {
    if (!data?.targetBranch) throw new Error('Target branch is required for merge');
    await git.merge(data.targetBranch, {
      rebaseBeforeMerge: data.rebaseBeforeMerge ?? false,
      squash: data.squash ?? false,
      fastForward: data.fastForward ?? false,
      squashMessage: data.squashMessage,
    });
  },

  'check-merge-conflicts': async (repoPath, git, data) => {
    if (!data?.sourceBranch) throw new Error('Source branch is required for merge conflict check');
    const hasConflicts = await git.willMergeHaveConflicts(data.sourceBranch, data.targetBranch);
    return { success: true, hasConflicts };
  },

  'check-rebase-conflicts': async (repoPath, git, data) => {
    if (!data?.ontoBranch) throw new Error('Target branch is required for rebase conflict check');
    if (!data?.sourceBranch) throw new Error('Source branch is required for rebase conflict check');
    const hasRebaseConflicts = await git.willRebaseHaveConflicts(data.ontoBranch, data.sourceBranch);
    return { success: true, hasConflicts: hasRebaseConflicts };
  },

  'get-remotes': async (repoPath, git, data) => {
    const remotes = await git.getRemotes();
    return { success: true, remotes };
  },

  'get-remote-branches': async (repoPath, git, data) => {
    if (!data?.remote) throw new Error('Remote name is required');
    const remoteBranches = await git.getRemoteBranches(data.remote);
    return { success: true, branches: remoteBranches };
  },

  'get-tracking-branch': async (repoPath, git, data) => {
    if (!data?.branch) throw new Error('Branch name is required');
    const tracking = await git.getTrackingBranch(data.branch);
    return { success: true, tracking };
  },

  'push-to-remote': async (repoPath, git, data) => {
    console.log('[API] push-to-remote action received:', data);
    if (!data?.localBranch) throw new Error('Local branch is required');
    if (!data?.remote) throw new Error('Remote is required');
    if (!data?.remoteBranch) throw new Error('Remote branch is required');

    const creds = await resolveCredentials(repoPath, git, data.remote);

    console.log('[API] Calling git.pushToRemote...');
    await git.pushToRemote(data.localBranch, data.remote, data.remoteBranch, {
      rebaseFirst: data.rebaseFirst ?? !(data.forcePush ?? false),
      forcePush: data.forcePush ?? false,
      setUpstream: data.setUpstream ?? false,
      squash: data.squash ?? false,
      squashMessage: data.squashMessage,
      credentials: creds,
    });
    console.log('[API] git.pushToRemote completed');
  },

  'pull-from-remote': async (repoPath, git, data) => {
    console.log('[API] pull-from-remote action received:', data);
    if (!data?.localBranch) throw new Error('Local branch is required');
    if (!data?.remote) throw new Error('Remote is required');
    if (!data?.remoteBranch) throw new Error('Remote branch is required');
    console.log('[API] Calling git.pullFromRemote...');
    await git.pullFromRemote(data.localBranch, data.remote, data.remoteBranch, {
      rebase: data.rebase ?? true,
    });
    console.log('[API] git.pullFromRemote completed');
  },

  stash: async (repoPath, git, data) => {
    await git.stash(data?.message);
  },

  'stash-list': async (repoPath, git, data) => {
    const stashes = await git.getStashes();
    return { success: true, stashes };
  },

  'stash-apply': async (repoPath, git, data) => {
    if (data?.index === undefined) throw new Error('Stash index is required');
    await git.applyStash(data.index);
  },

  'stash-drop': async (repoPath, git, data) => {
    if (data?.index === undefined) throw new Error('Stash index is required');
    await git.dropStash(data.index);
  },

  'stash-pop': async (repoPath, git, data) => {
    if (data?.index === undefined) throw new Error('Stash index is required');
    await git.popStash(data.index);
  },

  'stash-files': async (repoPath, git, data) => {
    if (data?.index === undefined) throw new Error('Stash index is required');
    const stashFiles = await git.getStashFiles(data.index);
    return { success: true, files: stashFiles };
  },

  'stash-file-diff': async (repoPath, git, data) => {
    if (data?.index === undefined) throw new Error('Stash index is required');
    if (!data?.file) throw new Error('File path is required');
    if (isImageFile(data.file)) {
      const mimeType = getImageMimeType(data.file);
      const [leftBuffer, rightBuffer, diff] = await Promise.all([
        git.getFileContentBuffer(data.file, `stash@{${data.index}}^1`),
        git.getFileContentBuffer(data.file, `stash@{${data.index}}`),
        git.getStashFilePatch(data.index, data.file),
      ]);

      return {
        success: true,
        left: '',
        right: '',
        diff,
        imageDiff: {
          left: toImageSide(leftBuffer, mimeType),
          right: toImageSide(rightBuffer, mimeType),
        },
      };
    }

    const stashFileDiff = await git.getStashFileDiff(data.index, data.file);
    return { success: true, ...stashFileDiff };
  },

  'cleanup-lock-file': async (repoPath, git, data) => {
    const cleaned = await git.cleanupLockFile();
    return { success: true, cleaned };
  }
};
