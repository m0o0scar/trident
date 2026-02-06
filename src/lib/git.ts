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
    gitInstances[repoPath] = simpleGit(options);
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
    const branchSummary = await this.git.branchLocal();
    
    // Get commit hash for each branch
    const branchCommits: Record<string, string> = {};
    for (const branch of branchSummary.all) {
      try {
        // Get the short hash of the latest commit on this branch
        const result = await this.git.revparse(['--short', branch]);
        branchCommits[branch] = result.trim();
      } catch (e) {
        console.error(`Failed to get commit for branch ${branch}:`, e);
      }
    }
    
    return {
      branches: branchSummary.all,
      current: branchSummary.current,
      branchCommits,
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

  async getCommitDiff(commitHash: string): Promise<{ files: { path: string; additions: number; deletions: number; status: string }[]; diff: string }> {
    // Get the list of files changed in this commit with stats
    const diffStat = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash]);
    const files = diffStat.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t'); // Handle paths with tabs (rare)
      return { path, status, additions: 0, deletions: 0 };
    });

    // Get the full diff for this commit
    const diff = await this.git.raw(['show', '--format=', commitHash]);

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
}
