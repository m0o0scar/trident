'use client';

import { useGitDiff } from '@/hooks/use-git';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { isFileBinary } from '@/lib/utils';
import { GroupedDiffViewer } from './grouped-diff-viewer';

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
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(splitView));
    } catch (e) {
      console.error('Failed to save split view preference:', e);
    }
  }, [splitView]);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 h-full"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full opacity-50">
        No diff available
      </div>
    )
  }

  // Check if file is binary (first by extension, then by content if unknown)
  const isBinary = isFileBinary(filePath, data.left, data.right);

  if (isBinary) {
    return (
      <div className="flex flex-col h-full bg-base-100">
        <div className="flex items-center justify-between px-4 h-[57px] border-b border-base-300 shrink-0 bg-base-100">
          <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
        </div>
        <div className="flex-1 flex items-center justify-center opacity-50">
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
    <div className="flex flex-col h-full bg-base-100">
      <div className="flex items-center justify-between px-4 h-[57px] border-b border-base-300 shrink-0 bg-base-100">
        <span className="text-sm font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
        <div className="flex items-center gap-2">
          <label htmlFor="split-view" className="text-[10px] uppercase tracking-wider font-bold cursor-pointer opacity-70">Split View</label>
          <input
            type="checkbox"
            id="split-view"
            checked={splitView}
            onChange={(e) => setSplitView(e.target.checked)}
            className="toggle toggle-sm toggle-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto diff-viewer-wrapper">
        {isLargeDiff && !renderAnyway ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-4">
            <i className="iconoir-warning-triangle text-[40px] text-warning" aria-hidden="true" />
            <div className="space-y-2">
              <h3 className="font-bold text-lg">Large Diff Detected</h3>
              <p className="opacity-70">
                This diff is large ({Math.round(contentSize / 1024)}KB, ~{lineCount} lines) and may freeze your browser if rendered.
              </p>
            </div>
            <button className="btn btn-outline" onClick={() => setRenderAnyway(true)}>
              Show Diff Anyway
            </button>
          </div>
        ) : (
          <GroupedDiffViewer
            oldValue={data.left || ''}
            newValue={data.right || ''}
            splitView={splitView}
            useDarkTheme={resolvedTheme === 'dark'}
          />
        )}
      </div>
    </div>
  );
}
