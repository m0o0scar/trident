import { NextResponse } from 'next/server';
import { GitService } from '@/lib/git';
import { getImageMimeType, isImageFile } from '@/lib/utils';
import fs from 'node:fs';
import pathLib from 'path';

function toImageSide(buffer: Buffer | null, mimeType: string) {
  if (!buffer) return null;
  return {
    mimeType,
    base64: buffer.toString('base64'),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoPath = searchParams.get('path');
  const filePath = searchParams.get('file');
  const commitHash = searchParams.get('commit');

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
        if (isImageFile(filePath)) {
          const mimeType = getImageMimeType(filePath);
          const [beforeBuffer, afterBuffer, diff] = await Promise.all([
            git.getFileContentBuffer(filePath, `${commitHash}^`),
            git.getFileContentBuffer(filePath, commitHash),
            git.getCommitFilePatch(commitHash, filePath),
          ]);

          return NextResponse.json({
            left: '',
            right: '',
            diff,
            imageDiff: {
              left: toImageSide(beforeBuffer, mimeType),
              right: toImageSide(afterBuffer, mimeType),
            },
          });
        }

        const { before, after, diff } = await git.getCommitFileDiff(commitHash, filePath);
        return NextResponse.json({ left: before, right: after, diff });
      }
      
      // Otherwise, get the list of files changed in the commit
      const { files, diff } = await git.getCommitDiff(commitHash);
      return NextResponse.json({ files, diff });
    }

    // Original behavior: diff against working directory
    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    const diff = await git.getDiff(filePath);

    if (isImageFile(filePath)) {
      const mimeType = getImageMimeType(filePath);
      const fullPath = pathLib.join(repoPath, filePath);
      const [leftBuffer, rightBuffer] = await Promise.all([
        git.getFileContentBuffer(filePath, 'HEAD'),
        fs.existsSync(fullPath) ? fs.promises.readFile(fullPath) : Promise.resolve(null),
      ]);

      return NextResponse.json({
        diff,
        left: '',
        right: '',
        imageDiff: {
          left: toImageSide(leftBuffer, mimeType),
          right: toImageSide(rightBuffer, mimeType),
        },
      });
    }

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
