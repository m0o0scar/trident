import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { GitStatus, GitLog } from './types';

// Cache simple-git instances to avoid spawning too many processes if possible,
// though simple-git is lightweight.
const gitInstances: Record<string, SimpleGit> = {};

export function getGit(repoPath: string): SimpleGit {
  if (!gitInstances[repoPath]) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
    };
    const git = simpleGit(options);
    
    // Configure git to not prompt for credentials - fail instead of hang
    git.env({
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no',
    });
    
    gitInstances[repoPath] = git;
  }
  return gitInstances[repoPath];
}

export class GitService {
  constructor(private repoPath: string) { }

  private get git(): SimpleGit {
    return getGit(this.repoPath);
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();
    // Transform simple-git status to our generic definitions if needed, 
    // but simple-git's StatusResult is compatible enough for now, 
    // except we might want to sanitize paths.
    // For now, we return it as is, casting to our interface (which matches simple-git mostly).
    return status as unknown as GitStatus;
  }

  async getLog(limit: number = 100): Promise<GitLog> {
    // Custom format to ensure we get parents and refs correctly
    const log = await this.git.log({
      '--all': null,
      '--max-count': limit,
      format: {
        hash: '%h',
        parents: '%p',
        date: '%ai',
        message: '%s',
        refs: '%d',
        author_name: '%an',
        author_email: '%ae',
        body: '%b'
      }
    });

    // Transform simple-git ListLogLine to our Commit type
    // simple-git handles the parsing if we pass the format object keys correctly matching our type, mostly.
    // Parents in simple-git are usually just space separated string in the custom format result unless processed.
    // We might need to map it.

    const commits = log.all.map((c: any) => ({
      ...c,
      parents: c.parents ? c.parents.split(' ').filter(Boolean) : []
    }));

    return {
      all: commits,
      total: log.total,
      latest: commits[0] || null
    } as unknown as GitLog;
  }

  async fetch(): Promise<void> {
    await this.git.fetch();
  }

  async fetchRemote(remote: string): Promise<void> {
    await this.git.fetch(remote);
  }

  async fetchAllRemotes(): Promise<void> {
    await this.git.fetch(['--all']);
  }

  async pull(): Promise<void> {
    await this.git.pull();
  }

  async push(): Promise<void> {
    await this.git.push();
  }

  async commit(message: string, files?: string[]): Promise<void> {
    if (files && files.length > 0) {
      await this.git.add(files);
    }
    await this.git.commit(message);
  }

  async stage(files: string[]): Promise<void> {
    await this.git.add(files);
  }

  async unstage(files: string[]): Promise<void> {
    await this.git.reset(['HEAD', ...files]);
  }

  // Get raw file content for diffing
  async getFileContent(path: string, ref: string = 'HEAD'): Promise<string> {
    try {
      return await this.git.show([`${ref}:${path}`]);
    } catch (e) {
      // If file is new (untracked), we might want to read from fs?
      // But for "HEAD", it fails.
      // Let's assume frontend handles untracked files by reading fs API directly? 
      // Or we fallback here?
      // For now, let it throw or return empty.
      console.error(e);
      return "";
    }
  }

  async getDiff(path: string): Promise<string> {
    // Get diff of working directory vs index (unstaged changes)
    // or index vs HEAD (staged changes)
    // This is a complex topic. 
    // For now, let's just get `git diff HEAD -- path`
    return await this.git.diff(['HEAD', path]);
  }

  async getBranches() {
    // Get local branches
    const localBranchSummary = await this.git.branchLocal();
    
    // Get all branches including remotes
    const allBranchSummary = await this.git.branch(['-a']);
    
    // Parse remote branches and group by remote name
    // Remote branches look like: remotes/origin/main, remotes/upstream/feature
    const remotes: Record<string, string[]> = {};
    const remoteBranchList: string[] = [];
    
    for (const branch of allBranchSummary.all) {
      if (branch.startsWith('remotes/')) {
        // Extract remote name and branch name
        // Format: remotes/origin/branch-name or remotes/origin/HEAD -> origin/main
        const withoutPrefix = branch.slice('remotes/'.length);
        const slashIndex = withoutPrefix.indexOf('/');
        if (slashIndex > 0) {
          const remoteName = withoutPrefix.slice(0, slashIndex);
          const branchName = withoutPrefix.slice(slashIndex + 1);
          
          // Skip HEAD symbolic refs
          if (branchName === 'HEAD' || branchName.startsWith('HEAD ')) continue;
          
          if (!remotes[remoteName]) {
            remotes[remoteName] = [];
          }
          remotes[remoteName].push(branchName);
          remoteBranchList.push(branch);
        }
      }
    }
    
    // Get commit hash for each branch (local and remote)
    const branchCommits: Record<string, string> = {};
    
    // Local branches
    for (const branch of localBranchSummary.all) {
      try {
        const result = await this.git.revparse(['--short', branch]);
        branchCommits[branch] = result.trim();
      } catch (e) {
        console.error(`Failed to get commit for branch ${branch}:`, e);
      }
    }
    
    // Remote branches - store with full ref path (e.g., "remotes/origin/main")
    for (const branch of remoteBranchList) {
      try {
        const result = await this.git.revparse(['--short', branch]);
        branchCommits[branch] = result.trim();
      } catch (e) {
        console.error(`Failed to get commit for remote branch ${branch}:`, e);
      }
    }
    
    // Get tracking info (upstream) and ahead/behind counts for local branches
    const trackingInfo: Record<string, { upstream: string; ahead: number; behind: number }> = {};
    
    for (const branch of localBranchSummary.all) {
      try {
        // Get the upstream branch for this local branch
        const upstream = await this.git.raw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`]);
        const upstreamBranch = upstream.trim();
        
        if (upstreamBranch) {
          // Get ahead/behind counts using rev-list --left-right --count
          const counts = await this.git.raw(['rev-list', '--left-right', '--count', `${branch}...${upstreamBranch}`]);
          const [ahead, behind] = counts.trim().split(/\s+/).map(n => parseInt(n, 10) || 0);
          
          trackingInfo[branch] = {
            upstream: upstreamBranch,
            ahead,
            behind
          };
        }
      } catch (e) {
        // Branch might not have an upstream, that's ok
        console.debug(`No tracking info for branch ${branch}:`, e);
      }
    }
    
    return {
      branches: localBranchSummary.all,
      current: localBranchSummary.current,
      branchCommits,
      remotes, // { "origin": ["main", "feature"], "upstream": ["main"] }
      trackingInfo, // { "main": { upstream: "origin/main", ahead: 5, behind: 1 } }
    };
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async createBranch(branch: string): Promise<void> {
    await this.git.checkoutLocalBranch(branch);
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.git.deleteLocalBranch(branch, true);
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.git.branch(['-m', oldName, newName]);
  }

  async rebase(ontoBranch: string, stashChanges: boolean = true): Promise<void> {
    if (stashChanges) {
      // Stash any local changes before rebasing
      const status = await this.git.status();
      const hasChanges = status.files.length > 0;
      
      if (hasChanges) {
        await this.git.stash(['push', '-m', 'auto-stash before rebase']);
      }
      
      try {
        await this.git.rebase([ontoBranch]);
        
        // Reapply stashed changes if we stashed anything
        if (hasChanges) {
          await this.git.stash(['pop']);
        }
      } catch (e) {
        // If rebase fails, try to pop stash anyway so user doesn't lose changes
        if (hasChanges) {
          try {
            await this.git.stash(['pop']);
          } catch {
            // Stash pop might fail if there are conflicts, that's ok
          }
        }
        throw e;
      }
    } else {
      // Discard local changes by resetting before rebase
      await this.git.reset(['--hard', 'HEAD']);
      await this.git.rebase([ontoBranch]);
    }
  }

  async getCommitDiff(commitHash: string): Promise<{ files: { path: string; additions: number; deletions: number; status: string }[]; diff: string }> {
    // Get the list of files changed in this commit with stats
    // Use -m --first-parent to handle merge commits properly:
    // - For regular commits: compares against the single parent (same behavior as before)
    // - For merge commits: compares against the first parent (the branch being merged INTO)
    const diffStat = await this.git.raw(['diff-tree', '-m', '--first-parent', '--no-commit-id', '--name-status', '-r', commitHash]);
    const files = diffStat.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t'); // Handle paths with tabs (rare)
      return { path, status, additions: 0, deletions: 0 };
    });

    // Get the full diff for this commit
    // Use -m --first-parent for merge commits to show the diff against first parent
    const diff = await this.git.raw(['show', '-m', '--first-parent', '--format=', commitHash]);

    return { files, diff };
  }

  async getCommitFileDiff(commitHash: string, filePath: string): Promise<{ before: string; after: string }> {
    // Get file content before the commit (parent)
    let before = '';
    let after = '';
    
    try {
      before = await this.git.show([`${commitHash}^:${filePath}`]);
    } catch {
      // File didn't exist before this commit (new file)
      before = '';
    }
    
    try {
      after = await this.git.show([`${commitHash}:${filePath}`]);
    } catch {
      // File was deleted in this commit
      after = '';
    }
    
    return { before, after };
  }

  async merge(
    targetBranch: string,
    options: {
      rebaseBeforeMerge?: boolean;
      squash?: boolean;
      fastForward?: boolean;
      squashMessage?: string;
    } = {}
  ): Promise<void> {
    const { rebaseBeforeMerge, squash, fastForward, squashMessage } = options;

    // Get the current branch name (the branch we want to merge FROM)
    const branchSummary = await this.git.branchLocal();
    const sourceBranch = branchSummary.current;

    // Rebase current branch onto target branch before merging if requested
    if (rebaseBeforeMerge) {
      await this.git.rebase([targetBranch]);
    }

    // Checkout the target branch (the branch we want to merge INTO)
    await this.git.checkout(targetBranch);

    // Build merge arguments
    const mergeArgs: string[] = [];

    if (squash) {
      mergeArgs.push('--squash');
    }

    if (fastForward) {
      mergeArgs.push('--ff-only');
    } else if (!squash) {
      // Use no-ff by default unless squashing (squash doesn't create a merge commit anyway)
      mergeArgs.push('--no-ff');
    }

    // Merge the source branch (original current branch) into target branch
    mergeArgs.push(sourceBranch);

    await this.git.merge(mergeArgs);

    // If squash merge, we need to commit with the provided message
    if (squash) {
      const message = squashMessage || `Squash merge branch '${sourceBranch}'`;
      await this.git.commit(message);
    }
  }

  async getRemotes(): Promise<string[]> {
    const remotes = await this.git.getRemotes();
    return remotes.map(r => r.name);
  }

  async getRemoteBranches(remote: string): Promise<string[]> {
    // Fetch from remote first to get latest branches
    await this.git.fetch(remote);
    
    const allBranches = await this.git.branch(['-r']);
    const remoteBranches: string[] = [];
    
    for (const branch of allBranches.all) {
      // Remote branches look like: origin/main, origin/feature
      if (branch.startsWith(`${remote}/`)) {
        const branchName = branch.slice(`${remote}/`.length);
        // Skip HEAD symbolic ref
        if (branchName === 'HEAD' || branchName.startsWith('HEAD ')) continue;
        remoteBranches.push(branchName);
      }
    }
    
    return remoteBranches;
  }

  async getTrackingBranch(localBranch: string): Promise<{ remote: string; branch: string } | null> {
    try {
      const upstream = await this.git.raw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${localBranch}`]);
      const upstreamBranch = upstream.trim();
      
      if (upstreamBranch) {
        // Parse "origin/main" format
        const slashIndex = upstreamBranch.indexOf('/');
        if (slashIndex > 0) {
          return {
            remote: upstreamBranch.slice(0, slashIndex),
            branch: upstreamBranch.slice(slashIndex + 1)
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async pullFromRemote(
    localBranch: string,
    remote: string,
    remoteBranch: string,
    options: {
      rebase?: boolean;
    } = {}
  ): Promise<void> {
    const { rebase = true } = options;
    
    console.log('[pullFromRemote] Starting pull:', { localBranch, remote, remoteBranch, options });
    
    // First, fetch from remote to get latest refs
    console.log('[pullFromRemote] Fetching from remote:', remote);
    await this.git.fetch(remote);
    console.log('[pullFromRemote] Fetch completed');
    
    const remoteFull = `${remote}/${remoteBranch}`;
    
    // Check if remote branch exists
    try {
      await this.git.revparse(['--verify', `refs/remotes/${remoteFull}`]);
      console.log('[pullFromRemote] Remote branch exists:', remoteFull);
    } catch {
      throw new Error(`Remote branch '${remoteFull}' does not exist`);
    }
    
    // Check if we have uncommitted changes
    const status = await this.git.status();
    const hasChanges = status.files.length > 0;
    console.log('[pullFromRemote] Has uncommitted changes:', hasChanges);
    
    if (hasChanges) {
      // Stash changes before pull
      console.log('[pullFromRemote] Stashing changes...');
      await this.git.stash(['push', '-m', 'auto-stash before pull']);
    }
    
    try {
      if (rebase) {
        // Rebase onto remote branch
        console.log('[pullFromRemote] Rebasing onto:', remoteFull);
        await this.git.rebase([remoteFull]);
        console.log('[pullFromRemote] Rebase completed');
      } else {
        // Merge remote branch
        console.log('[pullFromRemote] Merging:', remoteFull);
        await this.git.merge([remoteFull]);
        console.log('[pullFromRemote] Merge completed');
      }
      
      // Pop stashed changes if we stashed them
      if (hasChanges) {
        try {
          console.log('[pullFromRemote] Popping stashed changes...');
          await this.git.stash(['pop']);
        } catch {
          throw new Error('Pull succeeded but failed to restore local changes. Run "git stash pop" manually.');
        }
      }
      
      console.log('[pullFromRemote] Operation completed successfully');
    } catch (e) {
      console.error('[pullFromRemote] Error:', e);
      
      // Abort the operation if it failed
      try {
        if (rebase) {
          await this.git.rebase(['--abort']);
        } else {
          await this.git.merge(['--abort']);
        }
      } catch {
        // Abort might fail if there's nothing to abort
      }
      
      // Try to restore stashed changes on error
      if (hasChanges) {
        try {
          await this.git.stash(['pop']);
        } catch {
          // Ignore stash pop errors during error handling
        }
      }
      throw e;
    }
  }

  async pushToRemote(
    localBranch: string,
    remote: string,
    remoteBranch: string,
    options: {
      rebaseFirst?: boolean;
      forcePush?: boolean;
      setUpstream?: boolean;
    } = {}
  ): Promise<void> {
    const { rebaseFirst, forcePush, setUpstream } = options;
    
    console.log('[pushToRemote] Starting push:', { localBranch, remote, remoteBranch, options });
    
    // Check if we have uncommitted changes
    const status = await this.git.status();
    const hasChanges = status.files.length > 0;
    console.log('[pushToRemote] Has uncommitted changes:', hasChanges);
    
    if (hasChanges) {
      // Stash changes before push (including any rebase/merge operations)
      console.log('[pushToRemote] Stashing changes...');
      await this.git.stash(['push', '-m', 'auto-stash before push']);
    }
    
    try {
      // First, fetch from remote to update our local refs (general fetch, not specific branch)
      // This updates our knowledge of what branches exist on the remote
      console.log('[pushToRemote] Fetching from remote:', remote);
      await this.git.fetch(remote);
      console.log('[pushToRemote] Fetch completed');
      
      const remoteFull = `${remote}/${remoteBranch}`;
      
      // Check if remote branch exists by trying to resolve it
      let remoteBranchExists = false;
      try {
        await this.git.revparse(['--verify', `refs/remotes/${remoteFull}`]);
        remoteBranchExists = true;
        console.log('[pushToRemote] Remote branch exists:', remoteFull);
      } catch {
        // Remote branch doesn't exist
        remoteBranchExists = false;
        console.log('[pushToRemote] Remote branch does not exist:', remoteFull);
      }
      
      // Only rebase/merge if the remote branch exists
      if (remoteBranchExists) {
        if (rebaseFirst) {
          // Remote branch exists, rebase onto it
          console.log('[pushToRemote] Rebasing onto:', remoteFull);
          await this.git.rebase([remoteFull]);
          console.log('[pushToRemote] Rebase completed');
        } else {
          // Remote branch exists, merge it
          console.log('[pushToRemote] Merging:', remoteFull);
          await this.git.merge([remoteFull]);
          console.log('[pushToRemote] Merge completed');
        }
      }
      
      // Build push options
      const pushOptions: string[] = [];
      
      if (forcePush) {
        pushOptions.push('--force');
      }
      
      if (setUpstream) {
        pushOptions.push('-u');
      }
      
      // Add --progress to see what's happening
      pushOptions.push('--progress');
      
      console.log('[pushToRemote] Pushing to', remote, 'with refspec', `${localBranch}:${remoteBranch}`, 'options:', pushOptions);
      
      // Use simple-git's push method with explicit remote and branch
      // This handles credentials better than raw commands
      const pushResult = await this.git.push(remote, `${localBranch}:${remoteBranch}`, pushOptions);
      console.log('[pushToRemote] Push completed successfully, result:', pushResult);
      
      // Pop stashed changes if we stashed them
      if (hasChanges) {
        try {
          console.log('[pushToRemote] Popping stashed changes...');
          await this.git.stash(['pop']);
        } catch {
          // Stash pop might fail if there are conflicts
          throw new Error('Push succeeded but failed to restore local changes. Run "git stash pop" manually.');
        }
      }
      
      console.log('[pushToRemote] Operation completed successfully');
    } catch (e) {
      console.error('[pushToRemote] Error:', e);
      // Try to restore stashed changes on error
      if (hasChanges) {
        try {
          await this.git.stash(['pop']);
        } catch {
          // Ignore stash pop errors during error handling
        }
      }
      throw e;
    }
  }
}
