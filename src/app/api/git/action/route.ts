import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import { z } from 'zod';
import fs from 'node:fs';
import { actionSchema } from './types';
import { handlers } from './handlers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoPath, action, data } = actionSchema.parse(body);

    // Check if path exists
    if (!fs.existsSync(repoPath)) {
      return NextResponse.json({ error: `Path not found: ${repoPath}` }, { status: 404 });
    }

    const git = new GitService(repoPath);

    const handler = handlers[action];

    if (!handler) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const result = await handler(repoPath, git, data);

    if (result) {
      return NextResponse.json(result);
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
