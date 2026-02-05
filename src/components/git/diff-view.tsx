'use client';

import { useGitDiff } from '@/hooks/use-git';
import { Loader2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function DiffView({ repoPath, filePath }: { repoPath: string, filePath: string }) {
  const { data, isLoading } = useGitDiff(repoPath, filePath);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!data || !data.diff) {
      return (
          <div className="p-4 text-muted-foreground text-center border rounded-md bg-muted/20">
              No diff available (File might be new or binary)
          </div>
      )
  }

  return (
    <div className="border rounded-md overflow-hidden bg-gray-950 text-xs">
        <SyntaxHighlighter 
            language="diff" 
            style={vscDarkPlus}
            customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
            showLineNumbers
        >
            {data.diff}
        </SyntaxHighlighter>
    </div>
  );
}
