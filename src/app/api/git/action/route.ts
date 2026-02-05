
import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import { z } from 'zod';
import fs from 'node:fs';

const actionSchema = z.object({
  repoPath: z.string(),
  action: z.enum(['commit', 'push', 'pull', 'stage', 'unstage', 'fetch']),
  data: z.any().optional(), // Payload depends on action
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoPath, action, data } = actionSchema.parse(body);

    // Check if path exists
    if (!fs.existsSync(repoPath)) {
      return NextResponse.json({ error: `Path not found: ${repoPath}` }, { status: 404 });
    }

    const git = new GitService(repoPath);

    switch (action) {
      case 'commit':
        if (!data?.message) throw new Error('Commit message is required');
        await git.commit(data.message, data.files);
        break;
      case 'push':
        await git.push();
        break;
      case 'pull':
        await git.pull();
        break;
      case 'fetch':
        await git.fetch();
        break;
      case 'stage':
        if (!data?.files) throw new Error('Files are required for staging');
        await git.stage(data.files);
        break;
      case 'unstage':
        if (!data?.files) throw new Error('Files are required for unstaging');
        await git.unstage(data.files);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
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
