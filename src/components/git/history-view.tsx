'use client';

import { useGitLog, useGitBranches, useGitAction } from '@/hooks/use-git';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, GitBranch, Plus, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { GitGraph, GitGraphHandle } from './git-graph';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Tree node type for branch hierarchy
interface BranchTreeNode {
  name: string;
  fullPath?: string; // Only set for leaf nodes (actual branches)
  children: Map<string, BranchTreeNode>;
}

// Build tree structure from flat branch list
function buildBranchTree(branches: string[]): BranchTreeNode {
  const root: BranchTreeNode = { name: '', children: new Map() };

  for (const branch of branches) {
    const parts = branch.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;

      // If this is the last part, mark it as a leaf with full path
      if (i === parts.length - 1) {
        current.fullPath = branch;
      }
    }
  }

  return root;
}

// Recursive component to render branch tree
function BranchTreeItem({
  node,
  currentBranch,
  expandedFolders,
  onToggleFolder,
  onCheckout,
  onCreateBranch,
  onDeleteBranch,
  onBranchClick,
  depth = 0,
}: {
  node: BranchTreeNode;
  currentBranch?: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCheckout: (branch: string) => void;
  onCreateBranch: () => void;
  onDeleteBranch: (branch: string) => void;
  onBranchClick?: (branch: string) => void;
  depth?: number;
}) {
  const children = Array.from(node.children.values());
  const sortedChildren = children.sort((a, b) => {
    // Folders (non-leaf) come first, then alphabetical
    const aIsFolder = a.children.size > 0 && !a.fullPath;
    const bIsFolder = b.children.size > 0 && !b.fullPath;
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sortedChildren.map((child) => {
        const isLeaf = child.fullPath !== undefined;
        const isFolder = child.children.size > 0 && !isLeaf;
        const folderPath = child.fullPath || (node.name ? `${node.name}/${child.name}` : child.name);
        const isExpanded = expandedFolders.has(folderPath);
        const isCurrent = isLeaf && child.fullPath === currentBranch;

        if (isFolder) {
          // Render folder
          return (
            <div key={folderPath}>
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground",
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onToggleFolder(folderPath)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate">{child.name}</span>
              </div>
              {isExpanded && (
                <BranchTreeItem
                  node={child}
                  currentBranch={currentBranch}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onCheckout={onCheckout}
                  onCreateBranch={onCreateBranch}
                  onDeleteBranch={onDeleteBranch}
                  onBranchClick={onBranchClick}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        // Render leaf (actual branch)
        return (
          <ContextMenu key={child.fullPath}>
            <ContextMenuTrigger>
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                  isCurrent && "bg-muted font-medium text-primary"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onBranchClick?.(child.fullPath!)}
              >
                <GitBranch className={cn("h-3 w-3 shrink-0 text-muted-foreground", isCurrent && "text-primary")} />
                <span className="truncate flex-1" title={child.fullPath}>{child.name}</span>
                {isCurrent && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                disabled={isCurrent}
                onSelect={() => onCheckout(child.fullPath!)}
              >
                Checkout
              </ContextMenuItem>
              <ContextMenuItem onSelect={onCreateBranch}>
                Create Branch...
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isCurrent}
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteBranch(child.fullPath!)}
              >
                Delete Branch...
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </>
  );
}

export function HistoryView({ repoPath }: { repoPath: string }) {
  const [limit, setLimit] = useState(100);
  const { data: log, isLoading, isError, error, refetch, isFetching } = useGitLog(repoPath, limit);
  const { data: branchData } = useGitBranches(repoPath);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const { mutateAsync: runGitAction } = useGitAction();
  const [iscreateBranchOpen, setIsCreateBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ref for GitGraph to scroll to commits
  const gitGraphRef = useRef<GitGraphHandle>(null);
  
  // State for pending scroll to branch commit
  const [pendingScrollCommit, setPendingScrollCommit] = useState<string | null>(null);

  // Build branch tree and manage expanded state
  const branchTree = useMemo(() => {
    if (!branchData?.branches) return null;
    return buildBranchTree(branchData.branches);
  }, [branchData?.branches]);

  // Storage key for this repo's expanded folders
  const storageKey = `git-web:branch-tree-expanded:${repoPath}`;

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Load from local storage on initial render
    if (typeof window === 'undefined') return new Set();
    try {
      const key = `git-web:branch-tree-expanded:${repoPath}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load expanded folders from localStorage:', e);
    }
    return new Set();
  });

  // Save to local storage whenever expanded folders change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedFolders)));
    } catch (e) {
      console.error('Failed to save expanded folders to localStorage:', e);
    }
  }, [expandedFolders, storageKey]);

  // Handle scrolling to branch commit when it's loaded
  useEffect(() => {
    if (!pendingScrollCommit || !log?.all || isFetching) return;
    
    // Check if commit exists in current loaded commits
    const commitExists = log.all.some(c => c.hash === pendingScrollCommit);
    
    if (commitExists) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        const scrolled = gitGraphRef.current?.scrollToCommit(pendingScrollCommit);
        if (scrolled) {
          setSelectedHash(pendingScrollCommit);
          setPendingScrollCommit(null);
        }
      });
    } else {
      // Need to load more commits - increase limit
      // Set a reasonable max limit to avoid infinite loading
      if (limit < 5000) {
        setLimit(l => l + 100);
      } else {
        // Give up after 5000 commits
        console.warn('Could not find commit after loading 5000 commits');
        setPendingScrollCommit(null);
      }
    }
  }, [pendingScrollCommit, log?.all, isFetching, limit]);

  // Handle branch click - find the branch's latest commit and scroll to it
  const handleBranchClick = useCallback((branch: string) => {
    if (!branchData?.branchCommits) return;
    
    const commitHash = branchData.branchCommits[branch];
    if (!commitHash) return;
    
    // Check if commit is already in view
    const commitExists = log?.all?.some(c => c.hash === commitHash);
    
    if (commitExists && gitGraphRef.current) {
      const scrolled = gitGraphRef.current.scrollToCommit(commitHash);
      if (scrolled) {
        setSelectedHash(commitHash);
        return;
      }
    }
    
    // Need to load more commits or scroll failed, set pending
    setPendingScrollCommit(commitHash);
    setSelectedHash(commitHash);
  }, [branchData?.branchCommits, log?.all]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const confirmDeleteBranch = (branch: string) => {
    setBranchToDelete(branch);
    setIsDeleteOpen(true);
  }

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeleting(true);
    try {
      await runGitAction({
        repoPath,
        action: 'delete-branch',
        data: { branch: branchToDelete }
      });
      setIsDeleteOpen(false);
      setBranchToDelete(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  }

  const handleCheckout = async (branchName: string) => {

    try {
      await runGitAction({
        repoPath,
        action: 'checkout',
        data: { branch: branchName }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName) return;
    setIsCreating(true);
    try {
      await runGitAction({
        repoPath,
        action: 'branch',
        data: { branch: newBranchName }
      });
      setIsCreateBranchOpen(false);
      setNewBranchName('');
    } catch (e) {
      console.error(e);
      // alert or toast error
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading && limit === 100) {
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 h-full flex-col gap-4">
        <p className="text-destructive font-medium">Error Loading History</p>
        <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'An unknown error occurred'}</p>
        <Button onClick={() => refetch()} variant="outline">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Try Again
        </Button>
      </div>
    );
  }

  if (!log) return <div className="flex items-center justify-center p-8 h-full text-muted-foreground">No history data available</div>;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Branch Sidebar */}
      <div className="w-64 flex flex-col border-r bg-muted/10">
        <div className="p-4 border-b flex items-center justify-between bg-background h-[57px]">
          <div className="flex items-center gap-2 font-semibold">
             <GitBranch className="h-4 w-4" />
             Branches
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreateBranchOpen(true)} title="Create Branch">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-2 space-y-0.5">
            {branchTree && (
              <BranchTreeItem
                node={branchTree}
                currentBranch={branchData?.current}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
                onCheckout={handleCheckout}
                onCreateBranch={() => setIsCreateBranchOpen(true)}
                onDeleteBranch={confirmDeleteBranch}
                onBranchClick={handleBranchClick}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the branch <span className="font-semibold text-foreground">{branchToDelete}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteBranch(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={iscreateBranchOpen} onOpenChange={setIsCreateBranchOpen}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from the current HEAD.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              placeholder="Branch name"
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateBranchOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button onClick={handleCreateBranch} disabled={!newBranchName || isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & Checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <div className="h-[57px] flex items-center justify-between px-6 border-b shrink-0">
          <h1 className="font-semibold text-lg">History</h1>
          <div className="text-xs text-muted-foreground font-mono">
            {log.all.length} commits {isFetching && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <GitGraph
            ref={gitGraphRef}
            commits={log.all}
            selectedHash={selectedHash || undefined}
            onSelectCommit={setSelectedHash}
            onEndReached={() => {
              if (!isFetching && log.all.length >= limit) {
                setLimit(l => l + 50);
              }
            }}
            isLoadingMore={isFetching && limit > 100}
            currentBranch={branchData?.current}
          />
        </div>

        {selectedHash && (
          <div className="h-48 flex flex-col overflow-hidden border-t bg-muted/10">
            <div className="flex flex-row items-center py-2 px-4 border-b bg-background shrink-0 justify-between">
              <span className="text-sm font-semibold truncate flex-1 mr-4">
                {log.all.find(c => c.hash === selectedHash)?.message}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                  {selectedHash.substring(0, 7)}
              </span>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-background">
              <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {log.all.find(c => c.hash === selectedHash)?.body}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
