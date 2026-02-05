
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import fs from 'node:fs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  const limit = searchParams.get('limit');

  if (!path) {
    return NextResponse.json({ error: 'Repo path is required' }, { status: 400 });
  }

  // Check if path exists
  if (!fs.existsSync(path)) {
    return NextResponse.json({ error: `Path not found: ${path}` }, { status: 404 });
  }

  try {
    const git = new GitService(path);
    const log = await git.getLog(limit ? parseInt(limit) : 50);
    return NextResponse.json(log);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not a git repository')) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
