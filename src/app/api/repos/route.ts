
import { NextResponse } from 'next/server';
import { getRepositories, addRepository, updateRepository, removeRepository } from '@/lib/store';
import { z } from 'zod';

export async function GET() {
  const repos = getRepositories();
  return NextResponse.json(repos);
}

const addRepoSchema = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
});

const updateRepoSchema = z.object({
  path: z.string().min(1),
  updates: z.object({
    name: z.string().optional(),
    credentialId: z.string().optional().nullable(),
  }),
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

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { path, updates } = updateRepoSchema.parse(body);
    // @ts-ignore
    const repo = updateRepository(path, updates);
    return NextResponse.json(repo);
  } catch (error) {
     if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 400 });
     }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

const deleteRepoSchema = z.object({
  path: z.string().min(1),
});

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { path } = deleteRepoSchema.parse(body);
    removeRepository(path);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
