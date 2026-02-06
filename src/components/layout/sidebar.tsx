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
    <div className={cn("pb-12 w-64 border-r min-h-screen bg-background relative", className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <div className="mb-6 px-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Workspace
            </h2>
             <Button variant="ghost" size="icon" asChild title="Back to Dashboard" className="h-8 w-8">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
          </div>

          <div className="px-4 mb-6">
               <p className="text-xs font-mono text-muted-foreground break-all border rounded p-2 bg-muted/30" title={repoPath}>
                {repoPath.split('/').pop()}
              </p>
          </div>

          <div className="space-y-1">
            <Button
              variant={isActive('status') ? 'secondary' : 'ghost'}
              className={cn("w-full justify-start", isActive('status') && "font-medium")}
              asChild
            >
              <Link href={getHref()}>
                <GitBranch className="mr-2 h-4 w-4" />
                Changes
              </Link>
            </Button>
            <Button
              variant={isActive('history') ? 'secondary' : 'ghost'}
              className={cn("w-full justify-start", isActive('history') && "font-medium")}
              asChild
            >
              <Link href={getHref('/history')}>
                <Clock className="mr-2 h-4 w-4" />
                History
              </Link>
            </Button>
            <Button
              variant={isActive('settings') ? 'secondary' : 'ghost'}
              className={cn("w-full justify-start", isActive('settings') && "font-medium")}
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

      <div className="absolute bottom-4 left-0 w-full px-6">
          <div className="flex items-center gap-2">
              <ThemeToggle />
              <span className="text-xs text-muted-foreground">Theme</span>
          </div>
      </div>
    </div>
  );
}
