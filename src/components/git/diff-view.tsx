'use client';

import { useGitDiff } from '@/hooks/use-git';
import { Loader2, AlertTriangle } from 'lucide-react';
import ReactDiffViewer from '@alexbruf/react-diff-viewer';
import '@alexbruf/react-diff-viewer/index.css';
import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { isFileBinary } from '@/lib/utils';

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

  const [renderAnyway, setRenderAnyway] = useState(false);
  
  const { resolvedTheme } = useTheme();

  // Reset renderAnyway when filePath changes
  useEffect(() => {
    setRenderAnyway(false);
  }, [filePath]);

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

  // Check if file is binary (first by extension, then by content if unknown)
  const isBinary = isFileBinary(filePath, data.left, data.right);

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

  // Large file protection
  const MAX_DIFF_SIZE = 100 * 1024; // 100KB
  const MAX_DIFF_LINES = 3000;

  const leftContent = data.left || '';
  const rightContent = data.right || '';
  
  // Use actual diff for size and line count if available
  // This is more accurate for the "large diff" warning
  const contentSize = data.diff ? data.diff.length : (leftContent.length + rightContent.length);
  
  const lineCount = data.diff 
    ? data.diff.split('\n').filter(line => 
        (line.startsWith('+') || line.startsWith('-')) && 
        !line.startsWith('+++') && 
        !line.startsWith('---')
      ).length 
    : (leftContent.match(/\n/g) || []).length + (rightContent.match(/\n/g) || []).length;

  const isLargeDiff = (contentSize > MAX_DIFF_SIZE || lineCount > MAX_DIFF_LINES);

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
        {isLargeDiff && !renderAnyway ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-4">
            <AlertTriangle className="h-12 w-12 text-yellow-500" />
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Large Diff Detected</h3>
              <p className="text-muted-foreground">
                This diff is large ({Math.round(contentSize / 1024)}KB, ~{lineCount} lines) and may freeze your browser if rendered.
              </p>
            </div>
            <Button variant="outline" onClick={() => setRenderAnyway(true)}>
              Show Diff Anyway
            </Button>
          </div>
        ) : (
          <ReactDiffViewer
            oldValue={data.left || ''}
            newValue={data.right || ''}
            splitView={splitView}
            useDarkTheme={resolvedTheme === 'dark'}
            disableWordDiff={true}
          />
        )}
      </div>
    </div>
  );
}
