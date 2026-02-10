
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import fs from 'node:fs';

import pathLib from 'path';



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoPath = searchParams.get('path');
  const filePath = searchParams.get('file');
  const commitHash = searchParams.get('commit');
  const fromHash = searchParams.get('from');
  const toHash = searchParams.get('to');

  if (!repoPath) {
    return NextResponse.json({ error: 'Repo path is required' }, { status: 400 });
  }

  // Check if path exists
  if (!fs.existsSync(repoPath)) {
    return NextResponse.json({ error: `Path not found: ${repoPath}` }, { status: 404 });
  }

  try {
    const git = new GitService(repoPath);

    // If commit hash is provided, get commit diff
    if (commitHash) {
      // If file path is also provided, get diff for that specific file in the commit
      if (filePath) {
        const { before, after, diff } = await git.getCommitFileDiff(commitHash, filePath);
        return NextResponse.json({ left: before, right: after, diff });
      }
      
      // Otherwise, get the list of files changed in the commit
      const { files, diff } = await git.getCommitDiff(commitHash);
      return NextResponse.json({ files, diff });
    }

    // If range hashes are provided, get range diff
    if (fromHash && toHash) {
      // If file path is also provided, get diff for that specific file in the range
      if (filePath) {
        const { before, after, diff } = await git.getRangeFileDiff(fromHash, toHash, filePath);
        return NextResponse.json({ left: before, right: after, diff });
      }

      // Otherwise, get the list of files changed in the range
      const { files, diff } = await git.getRangeDiff(fromHash, toHash);
      return NextResponse.json({ files, diff });
    }

    // Original behavior: diff against working directory
    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    const diff = await git.getDiff(filePath);

    // Get content for Diff Viewer
    const left = await git.getFileContent(filePath, 'HEAD');
    let right = '';
    const fullPath = pathLib.join(repoPath, filePath);
    if (fs.existsSync(fullPath)) {
      right = await fs.promises.readFile(fullPath, 'utf-8');
    }

    return NextResponse.json({ diff, left, right });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not a git repository')) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
