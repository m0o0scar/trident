
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GitBranch, Clock, FileDiff, Settings, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  activeView: 'status' | 'history' | 'settings';
  onChangeView: (view: 'status' | 'history' | 'settings') => void;
  repoPath: string;
}

export function Sidebar({ className, activeView, onChangeView, repoPath }: SidebarProps) {
  return (
    <div className={cn("pb-12 w-64 border-r min-h-screen bg-gray-50/40 dark:bg-gray-900/40", className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <div className="mb-2 px-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Workspace
            </h2>
            <Button variant="ghost" size="icon" asChild title="Back to Dashboard">
                 <Link href="/">
                    <ArrowLeft className="h-4 w-4" />
                 </Link>
            </Button>
          </div>
          <p className="px-4 text-xs text-muted-foreground break-all mb-4" title={repoPath}>
            {repoPath.split('/').pop()}
          </p>

          <div className="space-y-1">
            <Button 
                variant={activeView === 'status' ? 'secondary' : 'ghost'} 
                className="w-full justify-start"
                onClick={() => onChangeView('status')}
            >
              <GitBranch className="mr-2 h-4 w-4" />
              Changes
            </Button>
            <Button 
                variant={activeView === 'history' ? 'secondary' : 'ghost'} 
                className="w-full justify-start"
                onClick={() => onChangeView('history')}
            >
              <Clock className="mr-2 h-4 w-4" />
              History
            </Button>
            <Button 
                variant={activeView === 'settings' ? 'secondary' : 'ghost'} 
                className="w-full justify-start"
                onClick={() => onChangeView('settings')}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
