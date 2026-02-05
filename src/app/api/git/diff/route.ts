
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import fs from 'node:fs';

import pathLib from 'path';



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoPath = searchParams.get('path'); // Renamed for clarity, was 'path'
  const filePath = searchParams.get('file');

  if (!repoPath || !filePath) {
    return NextResponse.json({ error: 'Repo path and file path are required' }, { status: 400 });
  }

  // Check if path exists
  if (!fs.existsSync(repoPath)) {
    return NextResponse.json({ error: `Path not found: ${repoPath}` }, { status: 404 });
  }

  try {
    const git = new GitService(repoPath);
    // TODO: Support getting diff for staged vs unstaged, or specific commits
    // For now, simple diff against HEAD (changes in working dir)
    const diff = await git.getDiff(filePath);

    // Get content for Diff Viewer
    const left = await git.getFileContent(filePath, 'HEAD');
    let right = '';
    const fullPath = pathLib.join(repoPath, filePath);
    if (fs.existsSync(fullPath)) {
      // Check if directory? assume file for now
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
