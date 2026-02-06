'use client';

import { useGitDiff } from '@/hooks/use-git';
import { Loader2 } from 'lucide-react';
import ReactDiffViewer from '@alexbruf/react-diff-viewer';
import '@alexbruf/react-diff-viewer/index.css';
import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from 'next-themes';

// Check if content appears to be binary (contains null bytes or high ratio of non-printable chars)
function isBinaryContent(content: string): boolean {
  if (!content) return false;
  // Check for null bytes - strong indicator of binary content
  if (content.includes('\0')) return true;
  // Check first 8KB for non-printable characters
  const sample = content.slice(0, 8192);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow common whitespace (tab, newline, carriage return) and printable ASCII
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
  }
  // If more than 10% non-printable, likely binary
  return sample.length > 0 && (nonPrintable / sample.length) > 0.1;
}

export function DiffView({ repoPath, filePath }: { repoPath: string, filePath: string }) {
  const { data, isLoading } = useGitDiff(repoPath, filePath);
  
  // Storage key for split view preference
  const storageKey = 'git-web:diff-view-split';
  
  const [splitView, setSplitView] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : true;
    } catch (e) {
      console.error('Failed to load split view preference:', e);
      return true;
    }
  });
  
  const { resolvedTheme } = useTheme();

  // Save split view preference when it changes
  // We use a separate effect for saving to avoid hydration mismatches if we used the initializer alone
  // (though the initializer above is the standard pattern in this codebase)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(splitView));
    } catch (e) {
      console.error('Failed to save split view preference:', e);
    }
  }, [splitView]);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No diff available
      </div>
    )
  }

  // Check if either side is binary content
  const isBinary = isBinaryContent(data.left || '') || isBinaryContent(data.right || '');

  if (isBinary) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center justify-between px-4 h-[57px] border-b shrink-0 bg-background">
          <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Binary file - diff not available
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 h-[57px] border-b shrink-0 bg-background">
        <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
        <div className="flex items-center gap-2">
          <Label htmlFor="split-view" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer">Split View</Label>
          <Switch
            id="split-view"
            checked={splitView}
            onCheckedChange={setSplitView}
            className="scale-75 origin-right"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto diff-viewer-wrapper">
        <ReactDiffViewer
          oldValue={data.left || ''}
          newValue={data.right || ''}
          splitView={splitView}
          useDarkTheme={resolvedTheme === 'dark'}
          disableWordDiff={true}
        />
      </div>
    </div>
  );
}
