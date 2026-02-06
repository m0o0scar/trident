'use client';

import { useGitLog, useGitBranches, useGitAction, useCommitDiff, useCommitFileDiff, CommitFile } from '@/hooks/use-git';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, GitBranch, Plus, ChevronRight, ChevronDown, Folder, Eye, EyeOff, FilterX, FileText, FilePlus, FileMinus, FileEdit, GripHorizontal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { GitGraph, GitGraphHandle } from './git-graph';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDiffViewer from 'react-diff-viewer';
import { useTheme } from 'next-themes';
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

// Visibility state for branches/folders
type VisibilityState = 'visible' | 'hidden' | null;

// Map of path -> visibility state
type VisibilityMap = Record<string, VisibilityState>;

// Tree node type for branch hierarchy
interface BranchTreeNode {
  name: string;
  fullPath?: string; // Only set for leaf nodes (actual branches)
  children: Map<string, BranchTreeNode>;
}

// Check if content appears to be binary (contains null bytes or high ratio of non-printable chars)
function isBinaryContent(content: string): boolean {
  if (!content) return false;
  // Check for null bytes - strong indicator of binary content
  if (content.includes('\0')) return true;
  // Check first 8KB for non-printable characters
  const sample = content.slice(0, 8192);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow common whitespace (tab, newline, carriage return) and printable ASCII
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
  }
  // If more than 10% non-printable, likely binary
  return sample.length > 0 && (nonPrintable / sample.length) > 0.1;
}

// File status icon component
function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'A':
      return <FilePlus className="h-3.5 w-3.5 text-green-500" />;
    case 'D':
      return <FileMinus className="h-3.5 w-3.5 text-red-500" />;
    case 'M':
      return <FileEdit className="h-3.5 w-3.5 text-yellow-500" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// Component to show commit file diff
function CommitFileDiffView({ repoPath, commitHash, filePath }: { repoPath: string; commitHash: string; filePath: string }) {
  const { data, isLoading } = useCommitFileDiff(repoPath, commitHash, filePath);
  const { resolvedTheme } = useTheme();

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">No diff available</div>;
  }

  // Check if either side is binary content
  const isBinary = isBinaryContent(data.left || '') || isBinaryContent(data.right || '');

  if (isBinary) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Binary file - diff not available</div>;
  }

  return (
    <div className="overflow-auto h-full">
      <ReactDiffViewer
        oldValue={data.left || ''}
        newValue={data.right || ''}
        splitView={false}
        useDarkTheme={resolvedTheme === 'dark'}
        styles={{
          diffContainer: {
            fontSize: '11px',
            fontFamily: 'monospace',
          },
          line: {
            lineHeight: '1.3',
          },
          gutter: {
            lineHeight: '1.3',
          },
          contentText: {
            lineHeight: '1.3',
          },
        }}
      />
    </div>
  );
}

// Component to show commit changes
function CommitChangesView({ repoPath, commitHash }: { repoPath: string; commitHash: string }) {
  const { data, isLoading } = useCommitDiff(repoPath, commitHash);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Reset selected file when commit changes
  useEffect(() => {
    setSelectedFile(null);
  }, [commitHash]);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (!data || data.files.length === 0) {
    return <div className="flex items-center justify-center p-8 h-full text-muted-foreground">No changes in this commit</div>;
  }

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="w-64 border-r flex flex-col bg-muted/5 shrink-0">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b bg-background">
          {data.files.length} file{data.files.length !== 1 ? 's' : ''} changed
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1">
            {data.files.map((file) => (
              <div
                key={file.path}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedFile === file.path && "bg-muted"
                )}
                onClick={() => setSelectedFile(file.path)}
                title={file.path}
              >
                <FileStatusIcon status={file.status} />
                <span className="truncate flex-1 font-mono">{file.path.split('/').pop()}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Diff view */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs font-mono text-muted-foreground border-b bg-background shrink-0 truncate">
              {selectedFile}
            </div>
            <div className="flex-1 overflow-auto">
              <CommitFileDiffView repoPath={repoPath} commitHash={commitHash} filePath={selectedFile} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a file to view changes
          </div>
        )}
      </div>
    </div>
  );
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

// Get the effective visibility for a path (considering parent inheritance)
function getEffectiveVisibility(
  path: string,
  visibilityMap: VisibilityMap
): VisibilityState {
  // Check if this path has explicit visibility
  if (visibilityMap[path]) {
    return visibilityMap[path];
  }

  // Check parent paths for inherited visibility
  const parts = path.split('/');
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join('/');
    if (visibilityMap[parentPath]) {
      return visibilityMap[parentPath];
    }
  }

  return null;
}


// Visibility toggle button component
function VisibilityToggle({
  type,
  isActive,
  isInherited,
  onClick,
  showOnHover,
}: {
  type: 'visible' | 'hidden';
  isActive: boolean;
  isInherited: boolean;
  onClick: (e: React.MouseEvent) => void;
  showOnHover: boolean;
}) {
  const Icon = type === 'visible' ? Eye : EyeOff;
  const title = type === 'visible' 
    ? (isActive ? 'Remove visible filter' : 'Show only this branch')
    : (isActive ? 'Remove hide filter' : 'Hide this branch');

  return (
    <button
      className={cn(
        "p-0.5 rounded hover:bg-muted transition-colors shrink-0 cursor-pointer",
        isActive && "text-primary",
        isInherited && "opacity-50",
        !isActive && !showOnHover && "opacity-0 group-hover:opacity-100"
      )}
      onClick={onClick}
      title={title}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
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
  onRenameBranch,
  onBranchClick,
  visibilityMap,
  onToggleVisibility,
  parentPath = '',
  depth = 0,
}: {
  node: BranchTreeNode;
  currentBranch?: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCheckout: (branch: string) => void;
  onCreateBranch: () => void;
  onDeleteBranch: (branch: string) => void;
  onRenameBranch: (branch: string) => void;
  onBranchClick?: (branch: string) => void;
  visibilityMap: VisibilityMap;
  onToggleVisibility: (path: string, type: 'visible' | 'hidden') => void;
  parentPath?: string;
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
        const itemPath = child.fullPath || (parentPath ? `${parentPath}/${child.name}` : child.name);
        const isExpanded = expandedFolders.has(itemPath);
        const isCurrent = isLeaf && child.fullPath === currentBranch;

        // Get visibility state for this item
        const directVisibility = visibilityMap[itemPath];
        const effectiveVisibility = getEffectiveVisibility(itemPath, visibilityMap);
        const isInherited = !directVisibility && effectiveVisibility !== null;

        if (isFolder) {
          // Render folder
          return (
            <div key={itemPath}>
              <div
                className={cn(
                  "group flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground",
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <div className="flex items-center gap-1 flex-1 min-w-0" onClick={() => onToggleFolder(itemPath)}>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <Folder className="h-3 w-3 shrink-0" />
                  <span className="truncate">{child.name}</span>
                </div>
                <div className="flex items-center gap-0.5 ml-auto">
                  <VisibilityToggle
                    type="visible"
                    isActive={directVisibility === 'visible' || (isInherited && effectiveVisibility === 'visible')}
                    isInherited={isInherited && effectiveVisibility === 'visible'}
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(itemPath, 'visible'); }}
                    showOnHover={directVisibility === 'visible' || (isInherited && effectiveVisibility === 'visible')}
                  />
                  <VisibilityToggle
                    type="hidden"
                    isActive={directVisibility === 'hidden' || (isInherited && effectiveVisibility === 'hidden')}
                    isInherited={isInherited && effectiveVisibility === 'hidden'}
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(itemPath, 'hidden'); }}
                    showOnHover={directVisibility === 'hidden' || (isInherited && effectiveVisibility === 'hidden')}
                  />
                </div>
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
                  onRenameBranch={onRenameBranch}
                  onBranchClick={onBranchClick}
                  visibilityMap={visibilityMap}
                  onToggleVisibility={onToggleVisibility}
                  parentPath={itemPath}
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
                  "group flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                  isCurrent && "bg-muted font-medium text-primary"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => onBranchClick?.(child.fullPath!)}>
                  {isCurrent ? (
                    <span className="w-3 h-3 flex items-center justify-center shrink-0">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    </span>
                  ) : (
                    <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate flex-1" title={child.fullPath}>{child.name}</span>
                </div>
                <div className="flex items-center gap-0.5 ml-auto">
                  <VisibilityToggle
                    type="visible"
                    isActive={directVisibility === 'visible' || (isInherited && effectiveVisibility === 'visible')}
                    isInherited={isInherited && effectiveVisibility === 'visible'}
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(itemPath, 'visible'); }}
                    showOnHover={directVisibility === 'visible' || (isInherited && effectiveVisibility === 'visible')}
                  />
                  <VisibilityToggle
                    type="hidden"
                    isActive={directVisibility === 'hidden' || (isInherited && effectiveVisibility === 'hidden')}
                    isInherited={isInherited && effectiveVisibility === 'hidden'}
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(itemPath, 'hidden'); }}
                    showOnHover={directVisibility === 'hidden' || (isInherited && effectiveVisibility === 'hidden')}
                  />
                </div>
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
              <ContextMenuItem onSelect={() => onRenameBranch(child.fullPath!)}>
                Rename Branch...
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

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [branchToRename, setBranchToRename] = useState<string | null>(null);
  const [newBranchNameForRename, setNewBranchNameForRename] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Ref for GitGraph to scroll to commits
  const gitGraphRef = useRef<GitGraphHandle>(null);
  
  // State for pending scroll to branch commit
  const [pendingScrollCommit, setPendingScrollCommit] = useState<string | null>(null);

  // Bottom panel tab state
  const [activeTab, setActiveTab] = useState<'message' | 'changes'>('message');
  
  // Resizable bottom panel state - load from localStorage
  const panelHeightStorageKey = 'git-web:history-panel-height';
  const [panelHeight, setPanelHeight] = useState(() => {
    if (typeof window === 'undefined') return 200;
    try {
      const stored = localStorage.getItem(panelHeightStorageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= 100 && parsed <= 600) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load panel height from localStorage:', e);
    }
    return 200;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Save panel height to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(panelHeightStorageKey, String(panelHeight));
    } catch (e) {
      console.error('Failed to save panel height to localStorage:', e);
    }
  }, [panelHeight]);

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startY: e.clientY, startHeight: panelHeight };
  }, [panelHeight]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - e.clientY;
      const newHeight = Math.min(Math.max(resizeRef.current.startHeight + delta, 100), 600);
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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

  // Storage key for this repo's branch visibility
  const visibilityStorageKey = `git-web:branch-visibility:${repoPath}`;

  // Visibility state for branches/folders
  const [visibilityMap, setVisibilityMap] = useState<VisibilityMap>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(visibilityStorageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load visibility from localStorage:', e);
    }
    return {};
  });

  // Save visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(visibilityStorageKey, JSON.stringify(visibilityMap));
    } catch (e) {
      console.error('Failed to save visibility to localStorage:', e);
    }
  }, [visibilityMap, visibilityStorageKey]);

  // Toggle visibility for a path
  const handleToggleVisibility = useCallback((path: string, type: 'visible' | 'hidden') => {
    setVisibilityMap(prev => {
      const next = { ...prev };
      // If currently set to this type, remove it (toggle off)
      if (next[path] === type) {
        delete next[path];
      } else {
        // Set to this type (auto-removes the other one since we're replacing)
        next[path] = type;
      }
      return next;
    });
  }, []);

  // Clear all visibility filters
  const handleClearAllFilters = useCallback(() => {
    setVisibilityMap({});
  }, []);

  // Compute which branches should be visible based on visibility map
  const filteredCommits = useMemo(() => {
    if (!log?.all || !branchData?.branches || !branchData?.branchCommits) return log?.all || [];

    const hasVisibleMarkers = Object.values(visibilityMap).some(v => v === 'visible');
    const hasHiddenMarkers = Object.values(visibilityMap).some(v => v === 'hidden');

    // If no visibility markers are set, show all commits
    if (!hasVisibleMarkers && !hasHiddenMarkers) {
      return log.all;
    }

    // Calculate effective visibility for each branch
    const visibleBranches = new Set<string>();
    const hiddenBranches = new Set<string>();
    const nonHiddenBranches = new Set<string>(); // Branches that are not hidden (for hidden-only mode)
    
    for (const branch of branchData.branches) {
      const effectiveVis = getEffectiveVisibility(branch, visibilityMap);
      if (effectiveVis === 'visible') {
        visibleBranches.add(branch);
      } else if (effectiveVis === 'hidden') {
        hiddenBranches.add(branch);
      } else {
        // No visibility set - this branch is "neutral" (non-hidden)
        nonHiddenBranches.add(branch);
      }
    }

    // Build a map from commit hash to commit for quick lookup
    const commitMap = new Map(log.all.map(c => [c.hash, c]));
    
    // Helper to mark all ancestors as reachable
    const markReachable = (startHash: string, reachableSet: Set<string>) => {
      const stack = [startHash];
      while (stack.length > 0) {
        const hash = stack.pop()!;
        if (reachableSet.has(hash)) continue;
        
        const commit = commitMap.get(hash);
        if (!commit) continue;
        
        reachableSet.add(hash);
        
        // Add parents to process
        for (const parentHash of commit.parents || []) {
          if (!reachableSet.has(parentHash)) {
            stack.push(parentHash);
          }
        }
      }
    };
    
    // Find commits reachable from visible branches
    const reachableFromVisible = new Set<string>();
    for (const branch of visibleBranches) {
      const headHash = branchData.branchCommits[branch];
      if (headHash) {
        markReachable(headHash, reachableFromVisible);
      }
    }
    
    // If there are visible markers, only show commits reachable from visible branches
    if (hasVisibleMarkers) {
      return log.all.filter(commit => reachableFromVisible.has(commit.hash));
    }
    
    // If only hidden markers exist, show commits reachable from any non-hidden branch
    // A commit should only be hidden if it's EXCLUSIVELY reachable from hidden branches
    if (hasHiddenMarkers) {
      const reachableFromNonHidden = new Set<string>();
      for (const branch of nonHiddenBranches) {
        const headHash = branchData.branchCommits[branch];
        if (headHash) {
          markReachable(headHash, reachableFromNonHidden);
        }
      }
      
      return log.all.filter(commit => reachableFromNonHidden.has(commit.hash));
    }
    
    return log.all;
  }, [log?.all, branchData?.branches, branchData?.branchCommits, visibilityMap]);

  // Check if visibility filters are active
  const hasVisibilityFilters = useMemo(() => {
    return Object.values(visibilityMap).some(v => v === 'visible' || v === 'hidden');
  }, [visibilityMap]);

  // Compute hidden branches set for filtering branch tags in git graph
  const hiddenBranches = useMemo(() => {
    if (!branchData?.branches) return new Set<string>();
    
    const hidden = new Set<string>();
    for (const branch of branchData.branches) {
      const effectiveVis = getEffectiveVisibility(branch, visibilityMap);
      if (effectiveVis === 'hidden') {
        hidden.add(branch);
      }
    }
    return hidden;
  }, [branchData?.branches, visibilityMap]);

  // Auto-fetch more commits when filtered results are too few
  const MIN_FILTERED_COMMITS = 50;
  const MAX_AUTO_FETCH_LIMIT = 5000;
  
  useEffect(() => {
    // Only auto-fetch if:
    // 1. Visibility filters are active
    // 2. We have fewer filtered commits than the minimum threshold
    // 3. We're not already fetching
    // 4. We haven't hit the max limit
    // 5. There might be more commits to fetch (raw count >= current limit)
    if (
      hasVisibilityFilters &&
      filteredCommits.length < MIN_FILTERED_COMMITS &&
      !isFetching &&
      limit < MAX_AUTO_FETCH_LIMIT &&
      log?.all && log.all.length >= limit
    ) {
      // Fetch more commits - increase limit by 100
      setLimit(l => Math.min(l + 100, MAX_AUTO_FETCH_LIMIT));
    }
  }, [hasVisibilityFilters, filteredCommits.length, isFetching, limit, log?.all]);

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

  const confirmRenameBranch = (branch: string) => {
    setBranchToRename(branch);
    // Pre-fill with current branch name
    setNewBranchNameForRename(branch);
    setIsRenameOpen(true);
  }

  const handleRenameBranch = async () => {
    if (!branchToRename || !newBranchNameForRename) return;
    if (branchToRename === newBranchNameForRename) {
      setIsRenameOpen(false);
      return;
    }
    setIsRenaming(true);
    try {
      await runGitAction({
        repoPath,
        action: 'rename-branch',
        data: { oldName: branchToRename, newName: newBranchNameForRename }
      });
      setIsRenameOpen(false);
      setBranchToRename(null);
      setNewBranchNameForRename('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsRenaming(false);
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
          <div className="flex items-center gap-1">
            {hasVisibilityFilters && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 cursor-pointer" 
                onClick={handleClearAllFilters} 
                title="Clear all filters"
              >
                <FilterX className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" onClick={() => setIsCreateBranchOpen(true)} title="Create Branch">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
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
                onRenameBranch={confirmRenameBranch}
                onBranchClick={handleBranchClick}
                visibilityMap={visibilityMap}
                onToggleVisibility={handleToggleVisibility}
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

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Branch</DialogTitle>
            <DialogDescription>
              Enter a new name for the branch <span className="font-semibold text-foreground">{branchToRename}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newBranchNameForRename}
              onChange={e => setNewBranchNameForRename(e.target.value)}
              placeholder="New branch name"
              disabled={isRenaming}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)} disabled={isRenaming}>Cancel</Button>
            <Button 
              onClick={handleRenameBranch} 
              disabled={!newBranchNameForRename || newBranchNameForRename === branchToRename || isRenaming}
            >
              {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {filteredCommits.length !== log.all.length 
              ? `${filteredCommits.length} / ${log.all.length} commits` 
              : `${log.all.length} commits`
            } {isFetching && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <GitGraph
            ref={gitGraphRef}
            commits={filteredCommits}
            selectedHash={selectedHash || undefined}
            onSelectCommit={setSelectedHash}
            onEndReached={() => {
              if (!isFetching && log.all.length >= limit) {
                setLimit(l => l + 50);
              }
            }}
            isLoadingMore={isFetching && limit > 100}
            currentBranch={branchData?.current}
            hiddenBranches={hiddenBranches}
          />
        </div>

        {selectedHash && (
          <div 
            className="flex flex-col overflow-hidden border-t bg-muted/10"
            style={{ height: panelHeight }}
          >
            {/* Resize handle */}
            <div 
              className={cn(
                "h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-muted/50 transition-colors group shrink-0",
                isResizing && "bg-muted/50"
              )}
              onMouseDown={handleResizeStart}
            >
              <GripHorizontal className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </div>

            {/* Header with commit info and tabs */}
            <div className="flex flex-row items-center py-2 px-4 border-b bg-background shrink-0 justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <span className="text-sm font-semibold truncate">
                  {log.all.find(c => c.hash === selectedHash)?.message}
                </span>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {selectedHash.substring(0, 7)}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    activeTab === 'message' 
                      ? "bg-muted text-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  onClick={() => setActiveTab('message')}
                >
                  Message
                </button>
                <button
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    activeTab === 'changes' 
                      ? "bg-muted text-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  onClick={() => setActiveTab('changes')}
                >
                  Changes
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden bg-background">
              {activeTab === 'message' ? (
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {log.all.find(c => c.hash === selectedHash)?.body || 'No additional message'}
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <CommitChangesView repoPath={repoPath} commitHash={selectedHash} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
