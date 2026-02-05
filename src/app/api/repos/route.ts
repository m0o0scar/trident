
import { NextResponse } from 'next/server';
import { getRepositories, addRepository } from '@/lib/store';
import { z } from 'zod';

export async function GET() {
  const repos = getRepositories();
  return NextResponse.json(repos);
}

const addRepoSchema = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { path, name } = addRepoSchema.parse(body);
    const repo = addRepository(path, name);
    return NextResponse.json(repo);
  } catch (error) {
     if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 400 });
     }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
