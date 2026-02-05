
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Repo path is required' }, { status: 400 });
  }

  try {
    const git = new GitService(path);
    const status = await git.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
