
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import fs from 'node:fs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  const filePath = searchParams.get('file');

  if (!path || !filePath) {
    return NextResponse.json({ error: 'Repo path and file path are required' }, { status: 400 });
  }

  // Check if path exists
  if (!fs.existsSync(path)) {
    return NextResponse.json({ error: `Path not found: ${path}` }, { status: 404 });
  }

  try {
    const git = new GitService(path);
    // TODO: Support getting diff for staged vs unstaged, or specific commits
    // For now, simple diff against HEAD (changes in working dir)
    const diff = await git.getDiff(filePath);
    return NextResponse.json({ diff });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not a git repository')) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
