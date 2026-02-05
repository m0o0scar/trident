
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get('path');

  // Default to home directory
  const currentPath = requestedPath ? requestedPath : os.homedir();

  try {
      // Security check: though this is local app, basic sanity check
      // For now, allow reading anywhere as it's a dev tool/local tool.
      
      const stats = fs.statSync(currentPath);
      if (!stats.isDirectory()) {
          return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
      }

      const items = fs.readdirSync(currentPath, { withFileTypes: true });
      
      const folders = items
          .filter(item => item.isDirectory() && !item.name.startsWith('.')) // Filter hidden folders for noise reduction? Optional.
          // Let's allow hidden folders but maybe sort them last or user preference. 
          // For now, filter out common junk, but keep useful ones. 
          // Actually, let's keep all, but filter some really noisy ones if needed.
          // Or just standard: show all.
      
      // Let's verify if they are git repos
      const contents = items
        .filter(item => item.isDirectory())
        .map(item => {
            const itemPath = path.join(currentPath, item.name);
            let isRepo = false;
            try {
                // Check for .git directory inside
                if (fs.existsSync(path.join(itemPath, '.git'))) {
                    isRepo = true;
                }
            } catch (e) {}

            return {
                name: item.name,
                path: itemPath,
                isRepo
            };
        });

      // Sort: Visible folders first, then Repos first within that group, then alphabetical
      contents.sort((a, b) => {
          const aHidden = a.name.startsWith('.');
          const bHidden = b.name.startsWith('.');

          // Visible first
          if (!aHidden && bHidden) return -1;
          if (aHidden && !bHidden) return 1;

          // Repos first
          if (a.isRepo && !b.isRepo) return -1;
          if (!a.isRepo && b.isRepo) return 1;

          return a.name.localeCompare(b.name);
      });

      return NextResponse.json({
          path: currentPath,
          folders: contents,
          parent: path.dirname(currentPath)
      });
      
  } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
