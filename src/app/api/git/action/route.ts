
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import { getRepositories } from '@/lib/store';
import { getCredentialById, getCredentialToken, findCredentialForRemote } from '@/lib/credentials';
import { z } from 'zod';
import fs from 'node:fs';

const actionSchema = z.object({
  repoPath: z.string(),
  action: z.enum(['commit', 'push', 'pull', 'stage', 'unstage', 'fetch', 'checkout', 'checkout-to-local', 'branch', 'delete-branch', 'delete-remote-branch', 'rename-branch', 'reset', 'cherry-pick', 'rebase', 'merge', 'get-remotes', 'get-remote-branches', 'get-tracking-branch', 'push-to-remote', 'pull-from-remote', 'stash', 'stash-list', 'stash-apply', 'stash-drop', 'stash-pop', 'stash-files', 'stash-file-diff', 'reword']),
  data: z.any().optional(), // Payload depends on action
});

async function resolveCredentials(repoPath: string, git: GitService, remoteName?: string) {
  const repos = getRepositories();
  const repoConfig = repos.find(r => r.path === repoPath);
  
  // 1. Check for explicitly associated credential
  if (repoConfig?.credentialId) {
    const cred = await getCredentialById(repoConfig.credentialId);
    if (cred) {
      const token = await getCredentialToken(cred.id);
      if (token) {
        return { username: cred.username, token };
      }
    }
  }

  // 2. Fallback: try to find matching credential by URL
  if (remoteName) {
    const remoteUrl = await git.getRemoteUrl(remoteName);
    if (remoteUrl) {
       const result = await findCredentialForRemote(remoteUrl);
       if (result) {
         return { username: result.credential.username, token: result.token };
       }
    }
  }

  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoPath, action, data } = actionSchema.parse(body);

    // Check if path exists
    if (!fs.existsSync(repoPath)) {
      return NextResponse.json({ error: `Path not found: ${repoPath}` }, { status: 404 });
    }

    const git = new GitService(repoPath);

    switch (action) {
      case 'commit':
        if (!data?.message) throw new Error('Commit message is required');
        await git.commit(data.message, data.files);
        break;
      case 'push':
        // Try to resolve credentials
        let pushCredentials = await resolveCredentials(repoPath, git, undefined);
        
        if (!pushCredentials) {
            // If no associated credential, try to infer from upstream
            try {
                const status = await git.getBranches();
                const current = status.current;
                const tracking = status.trackingInfo[current];
                if (tracking && tracking.upstream) {
                    const slashIndex = tracking.upstream.indexOf('/');
                    if (slashIndex > 0) {
                        const remoteName = tracking.upstream.slice(0, slashIndex);
                        pushCredentials = await resolveCredentials(repoPath, git, remoteName);
                    }
                }
            } catch (e) {
                // Ignore errors finding upstream, just proceed without creds
                console.warn('[API] Failed to resolve upstream for push credentials:', e);
            }
        }
        
        await git.push({ credentials: pushCredentials });
        break;
      case 'pull':
        await git.pull();
        break;
      case 'fetch':
        if (data?.allRemotes) {
          await git.fetchAllRemotes();
        } else if (data?.remote) {
          await git.fetchRemote(data.remote);
        } else {
          await git.fetch();
        }
        break;
      case 'stage':
        if (!data?.files) throw new Error('Files are required for staging');
        await git.stage(data.files);
        break;
      case 'unstage':
        if (!data?.files) throw new Error('Files are required for unstaging');
        await git.unstage(data.files);
        break;
      case 'checkout':
        if (!data?.branch) throw new Error('Branch name is required for checkout');
        await git.checkout(data.branch);
        break;
      case 'checkout-to-local':
        if (!data?.remoteBranch) throw new Error('Remote branch is required for checkout-to-local');
        if (!data?.localBranch) throw new Error('Local branch name is required for checkout-to-local');
        await git.checkoutRemoteToLocal(data.remoteBranch, data.localBranch);
        break;
      case 'branch':
        if (!data?.branch) throw new Error('Branch name is required to create branch');
        await git.createBranch(data.branch);
        break;
      case 'delete-branch':
        if (!data?.branch) throw new Error('Branch name is required to delete branch');
        await git.deleteBranch(data.branch);
        break;
      case 'delete-remote-branch':
        if (!data?.remote) throw new Error('Remote name is required to delete remote branch');
        if (!data?.branch) throw new Error('Branch name is required to delete remote branch');
        
        const deleteCreds = await resolveCredentials(repoPath, git, data.remote);
        await git.deleteRemoteBranch(data.remote, data.branch, deleteCreds);
        break;
      case 'rename-branch':
        if (!data?.oldName) throw new Error('Old branch name is required to rename branch');
        if (!data?.newName) throw new Error('New branch name is required to rename branch');
        await git.renameBranch(data.oldName, data.newName);
        break;
      case 'reset':
        if (!data?.commitHash) throw new Error('Commit hash is required for reset');
        await git.reset(data.commitHash, data.mode ?? 'hard');
        break;
      case 'cherry-pick':
        if (!data?.commitHash) throw new Error('Commit hash is required for cherry-pick');
        await git.cherryPick(data.commitHash);
        break;
      case 'rebase':
        if (!data?.ontoBranch) throw new Error('Target branch is required for rebase');
        await git.rebase(data.ontoBranch, data.stashChanges ?? true);
        break;
      case 'reword':
        if (!data?.commitHash) throw new Error('Commit hash is required for reword');
        if (!data?.message) throw new Error('New message is required for reword');
        await git.reword(data.commitHash, data.message, data.branch);
        break;
      case 'merge':
        if (!data?.targetBranch) throw new Error('Target branch is required for merge');
        await git.merge(data.targetBranch, {
          rebaseBeforeMerge: data.rebaseBeforeMerge ?? false,
          squash: data.squash ?? false,
          fastForward: data.fastForward ?? false,
          squashMessage: data.squashMessage,
        });
        break;
      case 'get-remotes':
        const remotes = await git.getRemotes();
        return NextResponse.json({ success: true, remotes });
      case 'get-remote-branches':
        if (!data?.remote) throw new Error('Remote name is required');
        const remoteBranches = await git.getRemoteBranches(data.remote);
        return NextResponse.json({ success: true, branches: remoteBranches });
      case 'get-tracking-branch':
        if (!data?.branch) throw new Error('Branch name is required');
        const tracking = await git.getTrackingBranch(data.branch);
        return NextResponse.json({ success: true, tracking });
      case 'push-to-remote':
        console.log('[API] push-to-remote action received:', data);
        if (!data?.localBranch) throw new Error('Local branch is required');
        if (!data?.remote) throw new Error('Remote is required');
        if (!data?.remoteBranch) throw new Error('Remote branch is required');
        
        const creds = await resolveCredentials(repoPath, git, data.remote);
        
        console.log('[API] Calling git.pushToRemote...');
        await git.pushToRemote(data.localBranch, data.remote, data.remoteBranch, {
          rebaseFirst: data.rebaseFirst ?? true,
          forcePush: data.forcePush ?? false,
          setUpstream: data.setUpstream ?? false,
          squash: data.squash ?? false,
          squashMessage: data.squashMessage,
          credentials: creds,
        });
        console.log('[API] git.pushToRemote completed');
        break;
      case 'pull-from-remote':
        console.log('[API] pull-from-remote action received:', data);
        if (!data?.localBranch) throw new Error('Local branch is required');
        if (!data?.remote) throw new Error('Remote is required');
        if (!data?.remoteBranch) throw new Error('Remote branch is required');
        console.log('[API] Calling git.pullFromRemote...');
        await git.pullFromRemote(data.localBranch, data.remote, data.remoteBranch, {
          rebase: data.rebase ?? true,
        });
        console.log('[API] git.pullFromRemote completed');
        break;
      case 'stash':
        await git.stash(data?.message);
        break;
      case 'stash-list':
        const stashes = await git.getStashes();
        return NextResponse.json({ success: true, stashes });
      case 'stash-apply':
        if (data?.index === undefined) throw new Error('Stash index is required');
        await git.applyStash(data.index);
        break;
      case 'stash-drop':
        if (data?.index === undefined) throw new Error('Stash index is required');
        await git.dropStash(data.index);
        break;
      case 'stash-pop':
        if (data?.index === undefined) throw new Error('Stash index is required');
        await git.popStash(data.index);
        break;
      case 'stash-files':
        if (data?.index === undefined) throw new Error('Stash index is required');
        const stashFiles = await git.getStashFiles(data.index);
        return NextResponse.json({ success: true, files: stashFiles });
      case 'stash-file-diff':
        if (data?.index === undefined) throw new Error('Stash index is required');
        if (!data?.file) throw new Error('File path is required');
        const stashFileDiff = await git.getStashFileDiff(data.index, data.file);
        return NextResponse.json({ success: true, ...stashFileDiff });
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = (error as Error).message;
    if (message.includes('not a git repository')) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
