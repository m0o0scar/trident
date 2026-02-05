
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  const filePath = searchParams.get('file');

  if (!path || !filePath) {
    return NextResponse.json({ error: 'Repo path and file path are required' }, { status: 400 });
  }

  try {
    const git = new GitService(path);
    // TODO: Support getting diff for staged vs unstaged, or specific commits
    // For now, simple diff against HEAD (changes in working dir)
    const diff = await git.getDiff(filePath);
    return NextResponse.json({ diff });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
