'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GitBranch, Clock, Settings, ArrowLeft, PanelLeftClose, PanelLeft, Archive } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'workspace-sidebar-collapsed';
const SIDEBAR_WIDTH_EXPANDED = 256; // w-64
const SIDEBAR_WIDTH_COLLAPSED = 64; // w-16

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

// Use useLayoutEffect on client, useEffect on server to avoid SSR warnings
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repoPath = searchParams.get('path') || '';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [enableTransition, setEnableTransition] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Load collapsed state from localStorage synchronously before paint
  useIsomorphicLayoutEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    const collapsed = stored === 'true';
    setIsCollapsed(collapsed);
    setIsHydrated(true);
    
    // Set width directly via style to ensure correct width before any paint
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px`;
    }
    
    // Enable transitions after two frames to avoid initial animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setEnableTransition(true);
      });
    });
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
  };

  const getHref = (subPath: string = '') => {
    const p = new URLSearchParams(searchParams.toString());
    // Clean up tab if it exists from previous version, though we are moving away from it.
    p.delete('tab');
    return `/workspace${subPath}?${p.toString()}`;
  };

  const isActive = (view: 'status' | 'history' | 'settings' | 'stashes') => {
    if (view === 'status') return pathname === '/workspace/changes';
    if (view === 'history') return pathname === '/workspace' || pathname.startsWith('/workspace/history');
    if (view === 'settings') return pathname.startsWith('/workspace/settings');
    if (view === 'stashes') return pathname.startsWith('/workspace/stashes');
    return false;
  };

  // Calculate width
  const sidebarWidth = isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <div 
      ref={sidebarRef}
      style={{ 
        width: isHydrated ? sidebarWidth : undefined,
        // Start invisible to prevent flash of wrong width
        visibility: isHydrated ? 'visible' : 'hidden'
      }}
      className={cn(
        "pb-12 border-r min-h-screen bg-background relative",
        enableTransition && "transition-all duration-300",
        // Use class for SSR width, inline style takes over after hydration
        !isHydrated && "w-64",
        className
      )}
    >
      <div className="space-y-4 py-4">
        <div className={cn("px-3 py-2", isCollapsed && "px-2")}>
          <div className={cn("mb-6 flex items-center", isCollapsed ? "justify-center px-0" : "justify-between px-4")}>
            {!isCollapsed && (
              <h2 className="text-lg font-semibold tracking-tight">
                Workspace
              </h2>
            )}
            <div className={cn("flex items-center gap-1", isCollapsed && "flex-col")}>
              {!isCollapsed && (
                <Button variant="ghost" size="icon" asChild title="Back to Dashboard" className="h-8 w-8">
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleCollapsed} 
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} 
                className="h-8 w-8"
              >
                {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {!isCollapsed && (
            <div className="px-4 mb-6">
              <p className="text-xs font-mono text-muted-foreground break-all border rounded p-2 bg-muted/30" title={repoPath}>
                {repoPath.split('/').pop()}
              </p>
            </div>
          )}

          {isCollapsed && (
            <div className="mb-6 flex justify-center">
              <Button variant="ghost" size="icon" asChild title="Back to Dashboard" className="h-8 w-8">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}

          <div className="space-y-1">
            <Button
              variant={isActive('history') ? 'secondary' : 'ghost'}
              className={cn(
                "w-full",
                isCollapsed ? "justify-center px-2" : "justify-start",
                isActive('history') && "font-medium"
              )}
              asChild
              title={isCollapsed ? "History" : undefined}
            >
              <Link href={getHref()}>
                <Clock className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                {!isCollapsed && "History"}
              </Link>
            </Button>
            <Button
              variant={isActive('status') ? 'secondary' : 'ghost'}
              className={cn(
                "w-full",
                isCollapsed ? "justify-center px-2" : "justify-start",
                isActive('status') && "font-medium"
              )}
              asChild
              title={isCollapsed ? "Changes" : undefined}
            >
              <Link href={getHref('/changes')}>
                <GitBranch className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                {!isCollapsed && "Changes"}
              </Link>
            </Button>
            <Button
              variant={isActive('stashes') ? 'secondary' : 'ghost'}
              className={cn(
                "w-full",
                isCollapsed ? "justify-center px-2" : "justify-start",
                isActive('stashes') && "font-medium"
              )}
              asChild
              title={isCollapsed ? "Stashes" : undefined}
            >
              <Link href={getHref('/stashes')}>
                <Archive className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                {!isCollapsed && "Stashes"}
              </Link>
            </Button>
            <Button
              variant={isActive('settings') ? 'secondary' : 'ghost'}
              className={cn(
                "w-full",
                isCollapsed ? "justify-center px-2" : "justify-start",
                isActive('settings') && "font-medium"
              )}
              asChild
              title={isCollapsed ? "Settings" : undefined}
            >
              <Link href={getHref('/settings')}>
                <Settings className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                {!isCollapsed && "Settings"}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className={cn("absolute bottom-4 left-0 w-full", isCollapsed ? "px-2" : "px-6")}>
        <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-2")}>
          <ThemeToggle />
          {!isCollapsed && <span className="text-xs text-muted-foreground">Theme</span>}
        </div>
      </div>
    </div>
  );
}
