'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GitBranch, Clock, Settings, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { usePathname, useSearchParams } from 'next/navigation';

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repoPath = searchParams.get('path') || '';

  const getHref = (subPath: string = '') => {
    const p = new URLSearchParams(searchParams.toString());
    // Clean up tab if it exists from previous version, though we are moving away from it.
    p.delete('tab');
    return `/workspace${subPath}?${p.toString()}`;
  };

  const isActive = (view: 'status' | 'history' | 'settings') => {
    if (view === 'status') return pathname === '/workspace';
    if (view === 'history') return pathname.startsWith('/workspace/history');
    if (view === 'settings') return pathname.startsWith('/workspace/settings');
    return false;
  };

  return (
    <div className={cn("pb-12 w-64 border-r min-h-screen bg-gray-50/40 dark:bg-gray-900/40", className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <div className="mb-2 px-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Workspace
            </h2>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="icon" asChild title="Back to Dashboard">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <p className="px-4 text-xs text-muted-foreground break-all mb-4" title={repoPath}>
            {repoPath.split('/').pop()}
          </p>

          <div className="space-y-1">
            <Button
              variant={isActive('status') ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              asChild
            >
              <Link href={getHref()}>
                <GitBranch className="mr-2 h-4 w-4" />
                Changes
              </Link>
            </Button>
            <Button
              variant={isActive('history') ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              asChild
            >
              <Link href={getHref('/history')}>
                <Clock className="mr-2 h-4 w-4" />
                History
              </Link>
            </Button>
            <Button
              variant={isActive('settings') ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              asChild
            >
              <Link href={getHref('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
