'use client';

import { useGitDiff } from '@/hooks/use-git';
import { Loader2 } from 'lucide-react';
import ReactDiffViewer from 'react-diff-viewer';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from 'next-themes';

export function DiffView({ repoPath, filePath }: { repoPath: string, filePath: string }) {
  const { data, isLoading } = useGitDiff(repoPath, filePath);
  const [splitView, setSplitView] = useState(true);
  const { resolvedTheme } = useTheme();

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
      <div className="flex-1 overflow-auto">
        <ReactDiffViewer
          oldValue={data.left || ''}
          newValue={data.right || ''}
          splitView={splitView}
          useDarkTheme={resolvedTheme === 'dark'}
          styles={{
            diffContainer: {
              fontSize: '12px',
              fontFamily: 'monospace',
            }
          }}
        />
      </div>
    </div>
  );
}
