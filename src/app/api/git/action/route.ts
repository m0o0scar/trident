
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import { z } from 'zod';
import fs from 'node:fs';

const actionSchema = z.object({
  repoPath: z.string(),
  action: z.enum(['commit', 'push', 'pull', 'stage', 'unstage', 'fetch', 'checkout', 'branch', 'delete-branch', 'rename-branch', 'rebase', 'merge', 'get-remotes', 'get-remote-branches', 'get-tracking-branch', 'push-to-remote', 'pull-from-remote']),
  data: z.any().optional(), // Payload depends on action
});

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
        await git.push();
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
      case 'branch':
        if (!data?.branch) throw new Error('Branch name is required to create branch');
        await git.createBranch(data.branch);
        break;
      case 'delete-branch':
        if (!data?.branch) throw new Error('Branch name is required to delete branch');
        await git.deleteBranch(data.branch);
        break;
      case 'rename-branch':
        if (!data?.oldName) throw new Error('Old branch name is required to rename branch');
        if (!data?.newName) throw new Error('New branch name is required to rename branch');
        await git.renameBranch(data.oldName, data.newName);
        break;
      case 'rebase':
        if (!data?.ontoBranch) throw new Error('Target branch is required for rebase');
        await git.rebase(data.ontoBranch, data.stashChanges ?? true);
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
        console.log('[API] Calling git.pushToRemote...');
        await git.pushToRemote(data.localBranch, data.remote, data.remoteBranch, {
          rebaseFirst: data.rebaseFirst ?? true,
          forcePush: data.forcePush ?? false,
          setUpstream: data.setUpstream ?? false,
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
