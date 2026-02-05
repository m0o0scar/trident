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
    return {
      branches: branchSummary.all,
      current: branchSummary.current,
    };
  }
}
