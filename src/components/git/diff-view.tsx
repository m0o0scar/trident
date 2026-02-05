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
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!data) {
    return (
      <div className="p-4 text-muted-foreground text-center border rounded-md bg-muted/20">
        No diff available
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border rounded-md overflow-hidden bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <span className="text-xs font-mono truncate max-w-[70%]" title={filePath}>{filePath}</span>
        <div className="flex items-center gap-2">
          <Label htmlFor="split-view" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Split View</Label>
          <Switch
            id="split-view"
            checked={splitView}
            onCheckedChange={setSplitView}
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
