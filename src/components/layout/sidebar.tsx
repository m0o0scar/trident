'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GitBranch, Clock, Settings, PanelLeftClose, PanelLeft, Archive } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useGitStatus, useSettings, useUpdateSettings } from '@/hooks/use-git';

const SIDEBAR_COLLAPSED_KEY = 'workspace-sidebar-collapsed';
const SIDEBAR_WIDTH_EXPANDED = 256; // w-64
const SIDEBAR_WIDTH_COLLAPSED = 64; // w-16

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

// Use useLayoutEffect on client, useEffect on server to avoid SSR warnings
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const repoPath = searchParams.get('path') || '';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [enableTransition, setEnableTransition] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  
  // Fetch git status to get uncommitted changes count
  const { data: gitStatus } = useGitStatus(repoPath || null);
  const changesCount = gitStatus?.files?.length ?? 0;

  // Load collapsed state from global settings or fallback to localStorage
  useIsomorphicLayoutEffect(() => {
    let collapsed = false;
    
    if (settings && settings.sidebarCollapsed !== undefined) {
      collapsed = settings.sidebarCollapsed;
    } else {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      collapsed = stored === 'true';
    }

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
  }, [settings]);

  // Save collapsed state to global settings and localStorage
  const toggleCollapsed = useCallback(() => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
    
    updateSettings.mutate({ sidebarCollapsed: newValue });
  }, [isCollapsed, updateSettings]);

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
          <div className={cn("mb-6 flex items-center", isCollapsed ? "flex-col gap-2 px-0" : "justify-between px-4")}>
            {!isCollapsed && (
              <a
                href="/"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    // Cmd/Ctrl+click: open in new tab (default behavior)
                    return;
                  }
                  e.preventDefault();
                  router.push('/');
                }}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                title="Go to Home"
              >
                <img src="/icon.png" alt="Trident" className="h-5 w-5" />
                <h2 className="text-lg font-semibold tracking-tight">
                  Trident
                </h2>
              </a>
            )}
            {isCollapsed && (
              <a
                href="/"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    // Cmd/Ctrl+click: open in new tab (default behavior)
                    return;
                  }
                  e.preventDefault();
                  router.push('/');
                }}
                className="flex items-center justify-center h-8 w-8 hover:opacity-80 transition-opacity cursor-pointer"
                title="Go to Home"
              >
                <img src="/icon.png" alt="Trident" className="h-5 w-5" />
              </a>
            )}
            <div className={cn("flex items-center gap-1", isCollapsed && "flex-col")}>
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
                <GitBranch className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
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
              title={isCollapsed ? `Changes${changesCount > 0 ? ` (${changesCount})` : ''}` : undefined}
            >
              <Link href={getHref('/changes')}>
                <div className={cn("relative", !isCollapsed && "mr-2")}>
                  <Clock className="h-4 w-4" />
                  {isCollapsed && changesCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {changesCount > 99 ? '99+' : changesCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && (changesCount > 0 ? `Changes (${changesCount})` : "Changes")}
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
