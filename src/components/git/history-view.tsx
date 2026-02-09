'use client';

import { useGitLog, useGitBranches, useGitAction, useCommitDiff, useCommitFileDiff, CommitFile, BranchTrackingInfo, useRepository, useUpdateRepository, useSettings, useUpdateSettings } from '@/hooks/use-git';
import { Repository } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, GitBranch, Plus, ChevronRight, ChevronDown, Folder, Eye, EyeOff, FilterX, FileText, FilePlus, FileMinus, FileEdit, GripHorizontal, X, Globe, ArrowUp, ArrowDown, Upload, AlertCircle, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, sanitizeBranchName, isFileBinary } from '@/lib/utils';
import { GitGraph, GitGraphHandle } from './git-graph';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDiffViewer from '@alexbruf/react-diff-viewer';
import '@alexbruf/react-diff-viewer/index.css';
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from '@/components/ui/switch';
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
function CommitFileDiffView({ repoPath, commitHash, filePath, splitView }: { repoPath: string; commitHash: string; filePath: string; splitView: boolean }) {
  const { data, isLoading } = useCommitFileDiff(repoPath, commitHash, filePath);
  const { resolvedTheme } = useTheme();
  const [renderAnyway, setRenderAnyway] = useState(false);

  // Reset renderAnyway when file or commit changes
  useEffect(() => {
    setRenderAnyway(false);
  }, [filePath, commitHash]);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">No diff available</div>;
  }

  // Check if file is binary (first by extension, then by content if unknown)
  const isBinary = isFileBinary(filePath, data.left, data.right);

  if (isBinary) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Binary file - diff not available</div>;
  }

  // Large file protection
  const MAX_DIFF_SIZE = 100 * 1024; // 100KB
  const MAX_DIFF_LINES = 3000;

  const leftContent = data.left || '';
  const rightContent = data.right || '';
  
  // Use actual diff for size and line count if available
  const contentSize = data.diff ? data.diff.length : (leftContent.length + rightContent.length);
  
  const lineCount = data.diff 
    ? data.diff.split('\n').filter(line => 
        (line.startsWith('+') || line.startsWith('-')) && 
        !line.startsWith('+++') && 
        !line.startsWith('---')
      ).length 
    : (leftContent.match(/\n/g) || []).length + (rightContent.match(/\n/g) || []).length;

  const isLargeDiff = (contentSize > MAX_DIFF_SIZE || lineCount > MAX_DIFF_LINES);

  if (isLargeDiff && !renderAnyway) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Large Diff Detected</h3>
          <p className="text-muted-foreground">
            This diff is large ({Math.round(contentSize / 1024)}KB, ~{lineCount} lines) and may freeze your browser if rendered.
          </p>
        </div>
        <Button variant="outline" onClick={() => setRenderAnyway(true)}>
          Show Diff Anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <ReactDiffViewer
        oldValue={data.left || ''}
        newValue={data.right || ''}
        splitView={splitView}
        useDarkTheme={resolvedTheme === 'dark'}
        disableWordDiff={true}
      />
    </div>
  );
}

// Component to show commit changes
function CommitChangesView({ repoPath, commitHash }: { repoPath: string; commitHash: string }) {
  const { data, isLoading } = useCommitDiff(repoPath, commitHash);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  
  // Storage key for split view preference - same as in DiffView
  const storageKey = 'git-web:diff-view-split';
  
  const [splitView, setSplitView] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : true;
    } catch (e) {
      console.error('Failed to load split view preference:', e);
      return true;
    }
  });

  // Save split view preference when it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(splitView));
    } catch (e) {
      console.error('Failed to save split view preference:', e);
    }
  }, [splitView]);

  // Reset selected file when commit changes
  useEffect(() => {
    setSelectedFile(null);
  }, [commitHash]);

  // Auto-select first file when data loads and no file is selected
  useEffect(() => {
    if (!selectedFile && data?.files && data.files.length > 0) {
      setSelectedFile(data.files[0].path);
    }
  }, [data?.files, selectedFile]);

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
            <div className="px-4 py-2 text-xs font-mono text-muted-foreground border-b bg-background shrink-0 truncate flex items-center justify-between">
              <span className="truncate">{selectedFile}</span>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Label htmlFor="commit-diff-split-view" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer">Split View</Label>
                <Switch
                  id="commit-diff-split-view"
                  checked={splitView}
                  onCheckedChange={setSplitView}
                  className="scale-75 origin-right"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto diff-viewer-wrapper">
              <CommitFileDiffView repoPath={repoPath} commitHash={commitHash} filePath={selectedFile} splitView={splitView} />
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
function buildBranchTree(branches: string[], pathPrefix: string = ''): BranchTreeNode {
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
        // Use the full path with prefix for remote branches
        current.fullPath = pathPrefix ? `${pathPrefix}/${branch}` : branch;
      }
    }
  }

  return root;
}

// Build tree structure for remote branches, grouped by remote name
function buildRemoteBranchTree(remotes: Record<string, string[]>): Map<string, BranchTreeNode> {
  const result = new Map<string, BranchTreeNode>();
  
  for (const [remoteName, branches] of Object.entries(remotes)) {
    // Build tree for this remote's branches, with full ref path prefix
    result.set(remoteName, buildBranchTree(branches, `remotes/${remoteName}`));
  }
  
  return result;
}

// Get the effective visibility for a path (considering parent inheritance)
// groupPath is used for checking group-level visibility (e.g., "__local__" or "__remotes__" or "__remotes__/origin")
function getEffectiveVisibility(
  path: string,
  visibilityMap: VisibilityMap,
  groupPath?: string
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
  
  // Check group-level visibility
  if (groupPath) {
    // Check if any parent group has visibility set
    const groupParts = groupPath.split('/');
    for (let i = groupParts.length; i > 0; i--) {
      const parentGroupPath = groupParts.slice(0, i).join('/');
      if (visibilityMap[parentGroupPath]) {
        return visibilityMap[parentGroupPath];
      }
    }
  }

  return null;
}

// Group header component with visibility controls
function GroupHeader({
  name,
  groupPath,
  icon,
  isExpanded,
  onToggle,
  visibilityMap,
  onToggleVisibility,
  depth = 0,
}: {
  name: string;
  groupPath: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  visibilityMap: VisibilityMap;
  onToggleVisibility: (path: string, type: 'visible' | 'hidden') => void;
  depth?: number;
}) {
  const directVisibility = visibilityMap[groupPath];
  // Check parent group visibility for inheritance
  const parentGroupPath = groupPath.includes('/') 
    ? groupPath.split('/').slice(0, -1).join('/') 
    : undefined;
  const parentVisibility = parentGroupPath ? visibilityMap[parentGroupPath] : null;
  const effectiveVisibility = directVisibility || parentVisibility;
  const isInherited = !directVisibility && parentVisibility !== null;
  
  return (
    <div
      className={cn(
        "group flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted/50 transition-colors font-medium",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={onToggle}>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        {icon}
        <span className="truncate">{name}</span>
      </div>
      <div className="flex items-center gap-0.5 ml-auto">
        <VisibilityToggle
          type="visible"
          isActive={directVisibility === 'visible' || (isInherited && effectiveVisibility === 'visible')}
          isInherited={isInherited && effectiveVisibility === 'visible'}
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(groupPath, 'visible'); }}
          showOnHover={directVisibility === 'visible' || (isInherited && effectiveVisibility === 'visible')}
        />
        <VisibilityToggle
          type="hidden"
          isActive={directVisibility === 'hidden' || (isInherited && effectiveVisibility === 'hidden')}
          isInherited={isInherited && effectiveVisibility === 'hidden'}
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(groupPath, 'hidden'); }}
          showOnHover={directVisibility === 'hidden' || (isInherited && effectiveVisibility === 'hidden')}
        />
      </div>
    </div>
  );
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
  onCheckoutToLocal,
  onCreateBranch,
  onDeleteBranch,
  onRenameBranch,
  onRebase,
  onMerge,
  onPushToRemote,
  onPullFromRemote,
  onBranchClick,
  visibilityMap,
  onToggleVisibility,
  parentPath = '',
  depth = 0,
  groupPath,
  isRemote = false,
  trackingInfo,
}: {
  node: BranchTreeNode;
  currentBranch?: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCheckout: (branch: string) => void;
  onCheckoutToLocal: (remoteBranch: string) => void;
  onCreateBranch: () => void;
  onDeleteBranch: (branch: string) => void;
  onRenameBranch: (branch: string) => void;
  onRebase: (targetBranch: string) => void;
  onMerge: (targetBranch: string) => void;
  onPushToRemote: (branch: string) => void;
  onPullFromRemote: (branch: string) => void;
  onBranchClick?: (branch: string) => void;
  visibilityMap: VisibilityMap;
  onToggleVisibility: (path: string, type: 'visible' | 'hidden') => void;
  parentPath?: string;
  depth?: number;
  groupPath?: string;
  isRemote?: boolean;
  trackingInfo?: Record<string, BranchTrackingInfo>;
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
        const effectiveVisibility = getEffectiveVisibility(itemPath, visibilityMap, groupPath);
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
                  onCheckoutToLocal={onCheckoutToLocal}
                  onCreateBranch={onCreateBranch}
                  onDeleteBranch={onDeleteBranch}
                  onRenameBranch={onRenameBranch}
                  onRebase={onRebase}
                  onMerge={onMerge}
                  onPushToRemote={onPushToRemote}
                  onPullFromRemote={onPullFromRemote}
                  onBranchClick={onBranchClick}
                  visibilityMap={visibilityMap}
                  onToggleVisibility={onToggleVisibility}
                  parentPath={itemPath}
                  depth={depth + 1}
                  groupPath={groupPath}
                  isRemote={isRemote}
                  trackingInfo={trackingInfo}
                />
              )}
            </div>
          );
        }

        // Render leaf (actual branch)
        const branchTracking = !isRemote && child.fullPath ? trackingInfo?.[child.fullPath] : undefined;
        const hasDivergence = branchTracking && (branchTracking.ahead > 0 || branchTracking.behind > 0);
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
                <div 
                  className="flex items-center gap-2 flex-1 min-w-0" 
                  onClick={() => onBranchClick?.(child.fullPath!)}
                  onDoubleClick={() => !isCurrent && onCheckout(child.fullPath!)}
                >
                  {isCurrent ? (
                    <span className="w-3 h-3 flex items-center justify-center shrink-0">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    </span>
                  ) : isRemote ? (
                    <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate" title={child.fullPath}>{child.name}</span>
                  {hasDivergence && (
                    <span 
                      className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
                      title={`${branchTracking.ahead} ahead, ${branchTracking.behind} behind ${branchTracking.upstream}`}
                    >
                      {branchTracking.ahead > 0 && (
                        <span className="flex items-center">
                          <ArrowUp className="h-3 w-3" />
                          <span>{branchTracking.ahead}</span>
                        </span>
                      )}
                      {branchTracking.behind > 0 && (
                        <span className="flex items-center">
                          <ArrowDown className="h-3 w-3" />
                          <span>{branchTracking.behind}</span>
                        </span>
                      )}
                    </span>
                  )}
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
              {!isCurrent && !isRemote && (
                <ContextMenuItem
                  onSelect={() => onCheckout(child.fullPath!)}
                >
                  Checkout
                </ContextMenuItem>
              )}
              {isRemote && (
                <ContextMenuItem
                  onSelect={() => onCheckoutToLocal(child.fullPath!)}
                >
                  Checkout to local...
                </ContextMenuItem>
              )}
              <ContextMenuItem onSelect={onCreateBranch}>
                Create Branch...
              </ContextMenuItem>
              {!isRemote && (
                <ContextMenuItem onSelect={() => onRenameBranch(child.fullPath!)}>
                  Rename Branch...
                </ContextMenuItem>
              )}
              {!isRemote && (
                <ContextMenuItem onSelect={() => onPushToRemote(child.fullPath!)}>
                  Push to Remote...
                </ContextMenuItem>
              )}
              {!isRemote && (
                <ContextMenuItem onSelect={() => onPullFromRemote(child.fullPath!)}>
                  Pull from Remote...
                </ContextMenuItem>
              )}
              {!isCurrent && (
                <ContextMenuItem
                  onSelect={() => onRebase(child.fullPath!)}
                >
                  Rebase {currentBranch} onto {child.name}
                </ContextMenuItem>
              )}
              {!isCurrent && (
                <ContextMenuItem
                  onSelect={() => onMerge(child.fullPath!)}
                >
                  Merge {child.name} into {currentBranch}
                </ContextMenuItem>
              )}
              {!isCurrent && (
                <ContextMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDeleteBranch(child.fullPath!)}
                >
                  {isRemote ? 'Delete Remote Branch...' : 'Delete Branch...'}
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </>
  );
}

export function HistoryView({ repoPath }: { repoPath: string }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  
  const [limit, setLimit] = useState(100);
  const { data: log, isLoading, isError, error, refetch, isFetching } = useGitLog(repoPath, limit);
  const { data: branchData, isLoading: isBranchesLoading } = useGitBranches(repoPath);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const { mutateAsync: runGitAction } = useGitAction();
  const [iscreateBranchOpen, setIsCreateBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [deleteRemoteBranch, setDeleteRemoteBranch] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [branchToRename, setBranchToRename] = useState<string | null>(null);
  const [newBranchNameForRename, setNewBranchNameForRename] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const [isRebaseOpen, setIsRebaseOpen] = useState(false);
  const [rebaseTargetBranch, setRebaseTargetBranch] = useState<string | null>(null);
  const [rebaseStashChanges, setRebaseStashChanges] = useState(true);
  const [isRebasing, setIsRebasing] = useState(false);

  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeTargetBranch, setMergeTargetBranch] = useState<string | null>(null);
  const [mergeRebaseBeforeMerge, setMergeRebaseBeforeMerge] = useState(false);
  const [mergeSquash, setMergeSquash] = useState(false);
  const [mergeFastForward, setMergeFastForward] = useState(false);
  const [mergeSquashMessage, setMergeSquashMessage] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Push to remote dialog state
  const [isPushOpen, setIsPushOpen] = useState(false);
  const [pushBranch, setPushBranch] = useState<string | null>(null);
  const [pushRemotes, setPushRemotes] = useState<string[]>([]);
  const [pushSelectedRemote, setPushSelectedRemote] = useState<string>('');
  const [pushRemoteBranches, setPushRemoteBranches] = useState<string[]>([]);
  const [pushSelectedRemoteBranch, setPushSelectedRemoteBranch] = useState<string>('');
  const [pushTrackingBranch, setPushTrackingBranch] = useState<{ remote: string; branch: string } | null>(null);
  const [pushRebaseFirst, setPushRebaseFirst] = useState(true);
  const [pushForcePush, setPushForcePush] = useState(false);
  const [pushSquash, setPushSquash] = useState(false);
  const [pushSquashMessage, setPushSquashMessage] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushLoadingRemotes, setPushLoadingRemotes] = useState(false);
  const [pushLoadingBranches, setPushLoadingBranches] = useState(false);

  // Pull from remote dialog state
  const [isPullOpen, setIsPullOpen] = useState(false);
  const [pullBranch, setPullBranch] = useState<string | null>(null);
  const [pullRemotes, setPullRemotes] = useState<string[]>([]);
  const [pullSelectedRemote, setPullSelectedRemote] = useState<string>('');
  const [pullRemoteBranches, setPullRemoteBranches] = useState<string[]>([]);
  const [pullSelectedRemoteBranch, setPullSelectedRemoteBranch] = useState<string>('');
  const [pullTrackingBranch, setPullTrackingBranch] = useState<{ remote: string; branch: string } | null>(null);
  const [pullRebase, setPullRebase] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullLoadingRemotes, setPullLoadingRemotes] = useState(false);
  const [pullLoadingBranches, setPullLoadingBranches] = useState(false);

  // Checkout to local dialog state
  const [isCheckoutToLocalOpen, setIsCheckoutToLocalOpen] = useState(false);
  const [checkoutRemoteBranch, setCheckoutRemoteBranch] = useState<string | null>(null);
  const [checkoutLocalBranchName, setCheckoutLocalBranchName] = useState('');
  const [isCheckingOutToLocal, setIsCheckingOutToLocal] = useState(false);

  // Ref for GitGraph to scroll to commits
  const gitGraphRef = useRef<GitGraphHandle>(null);
  
  // State for pending scroll to branch commit
  const [pendingScrollCommit, setPendingScrollCommit] = useState<string | null>(null);

  // Bottom panel tab state
  const [activeTab, setActiveTab] = useState<'message' | 'changes'>('message');
  
  // Resizable bottom panel state - load from global settings or fallback to localStorage
  const panelHeightStorageKey = 'git-web:history-panel-height';
  const [panelHeight, setPanelHeight] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  
  // Track if user has manually resized the panel to avoid sync loops
  const userHasResized = useRef(false);

  // Load panel height from settings or localStorage
  useEffect(() => {
    if (settings?.historyPanelHeight) {
      setPanelHeight(settings.historyPanelHeight);
    } else {
      try {
        const stored = localStorage.getItem(panelHeightStorageKey);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed) && parsed >= 100 && parsed <= 600) {
            setPanelHeight(parsed);
          }
        }
      } catch (e) {
        console.error('Failed to load panel height from localStorage:', e);
      }
    }
  }, [settings?.historyPanelHeight]);

  // Save panel height to localStorage for immediate persistence
  useEffect(() => {
    try {
      localStorage.setItem(panelHeightStorageKey, String(panelHeight));
    } catch (e) {
      console.error('Failed to save panel height to localStorage:', e);
    }
  }, [panelHeight]);

  // Sync to global settings when resizing stops
  useEffect(() => {
    if (!isResizing && userHasResized.current) {
      updateSettings.mutate({ historyPanelHeight: panelHeight });
      userHasResized.current = false;
    }
  }, [isResizing, panelHeight, updateSettings]);

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
      userHasResized.current = true;
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

  // Build branch trees for local and remote branches
  const localBranchTree = useMemo(() => {
    if (!branchData?.branches) return null;
    return buildBranchTree(branchData.branches);
  }, [branchData?.branches]);
  
  const remoteBranchTrees = useMemo(() => {
    if (!branchData?.remotes) return null;
    return buildRemoteBranchTree(branchData.remotes);
  }, [branchData?.remotes]);
  
  // Check if we have any remote branches
  const hasRemotes = remoteBranchTrees && remoteBranchTrees.size > 0;
  
  const repository = useRepository(repoPath);
  const updateRepository = useUpdateRepository();

  // Group expanded state (for "Branches" and "Remotes" group headers)
  const [localGroupExpanded, setLocalGroupExpanded] = useState(true);
  const [remotesGroupExpanded, setRemotesGroupExpanded] = useState(true);

  // Visibility state for branches/folders
  const [visibilityMap, setVisibilityMap] = useState<VisibilityMap>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Load settings from repository data when it's available
  const lastInitializedRepo = useRef<string | null>(null);
  useEffect(() => {
    if (repository && repository.path !== lastInitializedRepo.current) {
      lastInitializedRepo.current = repository.path;
      if (repository.localGroupExpanded !== undefined) setLocalGroupExpanded(repository.localGroupExpanded);
      if (repository.remotesGroupExpanded !== undefined) setRemotesGroupExpanded(repository.remotesGroupExpanded);
      if (repository.expandedFolders) setExpandedFolders(new Set(repository.expandedFolders));
      if (repository.visibilityMap) setVisibilityMap(repository.visibilityMap as VisibilityMap);
    }
  }, [repository]);

  // Helper to save settings to the backend
  const saveSettings = useCallback((updates: Partial<Repository>) => {
    updateRepository.mutate({
      path: repoPath,
      updates
    });
  }, [repoPath, updateRepository]);

  const handleToggleLocalGroup = useCallback(() => {
    const newValue = !localGroupExpanded;
    setLocalGroupExpanded(newValue);
    saveSettings({ localGroupExpanded: newValue });
  }, [localGroupExpanded, saveSettings]);

  const handleToggleRemotesGroup = useCallback(() => {
    const newValue = !remotesGroupExpanded;
    setRemotesGroupExpanded(newValue);
    saveSettings({ remotesGroupExpanded: newValue });
  }, [remotesGroupExpanded, saveSettings]);

  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      saveSettings({ expandedFolders: Array.from(next) });
      return next;
    });
  }, [saveSettings]);

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
      saveSettings({ visibilityMap: next as any });
      return next;
    });
  }, [saveSettings]);

  // Clear all visibility filters
  const handleClearAllFilters = useCallback(() => {
    setVisibilityMap({});
    saveSettings({ visibilityMap: {} });
  }, [saveSettings]);

  // Helper to get effective visibility for a branch considering group paths
  const getBranchEffectiveVisibility = useCallback((branch: string, isRemoteBranch: boolean) => {
    // First check the branch itself
    const directVis = getEffectiveVisibility(branch, visibilityMap);
    if (directVis) return directVis;
    
    // Check group-level visibility
    if (isRemoteBranch) {
      // Remote branch format: remotes/origin/branch-name
      const parts = branch.split('/');
      if (parts.length >= 2 && parts[0] === 'remotes') {
        const remoteName = parts[1];
        // Check remote-specific group
        const remoteGroupVis = visibilityMap[`__remotes__/${remoteName}`];
        if (remoteGroupVis) return remoteGroupVis;
        // Check all remotes group
        const remotesVis = visibilityMap['__remotes__'];
        if (remotesVis) return remotesVis;
      }
    } else {
      // Local branch - check __local__ group
      const localVis = visibilityMap['__local__'];
      if (localVis) return localVis;
    }
    
    return null;
  }, [visibilityMap]);

  // Compute which branches should be visible based on visibility map
  const filteredCommits = useMemo(() => {
    if (!log?.all || !branchData?.branches || !branchData?.branchCommits) return log?.all || [];

    const hasVisibleMarkers = Object.values(visibilityMap).some(v => v === 'visible');
    const hasHiddenMarkers = Object.values(visibilityMap).some(v => v === 'hidden');

    // If no visibility markers are set, show all commits
    if (!hasVisibleMarkers && !hasHiddenMarkers) {
      return log.all;
    }

    // Get all branches (local + remote)
    const allBranches: { branch: string; isRemote: boolean }[] = [
      ...branchData.branches.map(b => ({ branch: b, isRemote: false })),
    ];
    
    // Add remote branches
    if (branchData.remotes) {
      for (const [remoteName, branches] of Object.entries(branchData.remotes)) {
        for (const branch of branches) {
          allBranches.push({ branch: `remotes/${remoteName}/${branch}`, isRemote: true });
        }
      }
    }

    // Calculate effective visibility for each branch
    const visibleBranches = new Set<string>();
    const hiddenBranchesSet = new Set<string>();
    const nonHiddenBranches = new Set<string>(); // Branches that are not hidden (for hidden-only mode)
    
    for (const { branch, isRemote } of allBranches) {
      const effectiveVis = getBranchEffectiveVisibility(branch, isRemote);
      if (effectiveVis === 'visible') {
        visibleBranches.add(branch);
      } else if (effectiveVis === 'hidden') {
        hiddenBranchesSet.add(branch);
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
  }, [log?.all, branchData?.branches, branchData?.branchCommits, branchData?.remotes, visibilityMap, getBranchEffectiveVisibility]);

  // Check if visibility filters are active
  const hasVisibilityFilters = useMemo(() => {
    return Object.values(visibilityMap).some(v => v === 'visible' || v === 'hidden');
  }, [visibilityMap]);

  // Compute hidden branches set for filtering branch tags in git graph
  const hiddenBranches = useMemo(() => {
    const hidden = new Set<string>();
    
    // Check local branches
    if (branchData?.branches) {
      for (const branch of branchData.branches) {
        const effectiveVis = getBranchEffectiveVisibility(branch, false);
        if (effectiveVis === 'hidden') {
          hidden.add(branch);
        }
      }
    }
    
    // Check remote branches
    if (branchData?.remotes) {
      for (const [remoteName, branches] of Object.entries(branchData.remotes)) {
        for (const branch of branches) {
          const fullRef = `remotes/${remoteName}/${branch}`;
          const effectiveVis = getBranchEffectiveVisibility(fullRef, true);
          if (effectiveVis === 'hidden') {
            hidden.add(fullRef);
          }
        }
      }
    }
    
    return hidden;
  }, [branchData?.branches, branchData?.remotes, getBranchEffectiveVisibility]);

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

  const confirmDeleteBranch = (branch: string) => {
    setBranchToDelete(branch);
    setDeleteRemoteBranch(false);
    setIsDeleteOpen(true);
  }

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeleting(true);
    try {
      // Check if it is a remote branch
      if (branchToDelete.startsWith('remotes/')) {
        const parts = branchToDelete.split('/');
        // remotes/origin/main -> remote=origin, branch=main
        if (parts.length >= 3) {
          const remote = parts[1];
          const branch = parts.slice(2).join('/');
          await runGitAction({
            repoPath,
            action: 'delete-remote-branch',
            data: { remote, branch }
          });
        }
      } else {
        // Local branch
        if (deleteRemoteBranch) {
          const tracking = branchData?.trackingInfo?.[branchToDelete];
          if (tracking && tracking.upstream) {
            try {
              const [remote, ...branchParts] = tracking.upstream.split('/');
              const branch = branchParts.join('/');
              if (remote && branch) {
                await runGitAction({
                  repoPath,
                  action: 'delete-remote-branch',
                  data: { remote, branch }
                });
              }
            } catch (error) {
              console.error('Failed to delete remote branch:', error);
              // Continue to delete local branch even if remote deletion fails
            }
          }
        }

        await runGitAction({
          repoPath,
          action: 'delete-branch',
          data: { branch: branchToDelete }
        });
      }
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

  const confirmRebase = (targetBranch: string) => {
    setRebaseTargetBranch(targetBranch);
    setRebaseStashChanges(true);
    setIsRebaseOpen(true);
  }

  const handleRebase = async () => {
    if (!rebaseTargetBranch) return;
    setIsRebasing(true);
    try {
      await runGitAction({
        repoPath,
        action: 'rebase',
        data: { ontoBranch: rebaseTargetBranch, stashChanges: rebaseStashChanges }
      });
      setIsRebaseOpen(false);
      setRebaseTargetBranch(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRebasing(false);
    }
  }

  const confirmMerge = (targetBranch: string) => {
    setMergeTargetBranch(targetBranch);
    setMergeRebaseBeforeMerge(false);
    setMergeSquash(false);
    setMergeFastForward(false);
    setMergeSquashMessage('');
    setIsMergeOpen(true);
  }

  const handleMerge = async () => {
    if (!mergeTargetBranch) return;
    setIsMerging(true);
    try {
      await runGitAction({
        repoPath,
        action: 'merge',
        data: {
          targetBranch: mergeTargetBranch,
          rebaseBeforeMerge: mergeRebaseBeforeMerge,
          squash: mergeSquash,
          fastForward: mergeFastForward,
          squashMessage: mergeSquash ? mergeSquashMessage : undefined,
        }
      });
      setIsMergeOpen(false);
      setMergeTargetBranch(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsMerging(false);
    }
  }

  const confirmPushToRemote = async (branch: string) => {
    setPushBranch(branch);
    setPushError(null);
    setPushRemotes([]);
    setPushRemoteBranches([]);
    setPushSelectedRemote('');
    setPushSelectedRemoteBranch('');
    setPushTrackingBranch(null);
    setPushRebaseFirst(true);
    setPushForcePush(false);
    setPushSquash(false);
    setPushSquashMessage('');
    setIsPushOpen(true);
    
    // Load remotes
    setPushLoadingRemotes(true);
    try {
      const result = await runGitAction({
        repoPath,
        action: 'get-remotes',
        data: {}
      });
      
      if (!result.remotes || result.remotes.length === 0) {
        setPushError('No remote repository configured. Please add a remote first.');
        setPushLoadingRemotes(false);
        return;
      }
      
      setPushRemotes(result.remotes);
      
      // Get tracking branch info
      const trackingResult = await runGitAction({
        repoPath,
        action: 'get-tracking-branch',
        data: { branch }
      });
      
      setPushTrackingBranch(trackingResult.tracking);
      
      // Set default remote - use tracking remote if available and exists in remotes list, otherwise first remote
      const trackingRemote = trackingResult.tracking?.remote;
      const defaultRemote = (trackingRemote && result.remotes.includes(trackingRemote)) 
        ? trackingRemote 
        : result.remotes[0];
      setPushSelectedRemote(defaultRemote);
      
      // Load branches for the default remote
      setPushLoadingBranches(true);
      const branchesResult = await runGitAction({
        repoPath,
        action: 'get-remote-branches',
        data: { remote: defaultRemote }
      });
      
      setPushRemoteBranches(branchesResult.branches || []);
      
      // Set default remote branch - use tracking branch if on same remote, otherwise use branch name
      if (trackingResult.tracking?.remote === defaultRemote && trackingResult.tracking?.branch) {
        setPushSelectedRemoteBranch(trackingResult.tracking.branch);
      } else {
        // Default to same name as local branch, or first branch if local branch name doesn't exist
        const localBranchName = branch;
        if (branchesResult.branches?.includes(localBranchName)) {
          setPushSelectedRemoteBranch(localBranchName);
        } else {
          // Will create new branch with local branch name
          setPushSelectedRemoteBranch(localBranchName);
        }
      }
    } catch (e) {
      console.error(e);
      setPushError((e as Error).message || 'Failed to load remote information');
    } finally {
      setPushLoadingRemotes(false);
      setPushLoadingBranches(false);
    }
  }

  const handlePushRemoteChange = async (remote: string) => {
    setPushSelectedRemote(remote);
    setPushLoadingBranches(true);
    setPushRemoteBranches([]);
    
    try {
      const branchesResult = await runGitAction({
        repoPath,
        action: 'get-remote-branches',
        data: { remote }
      });
      
      setPushRemoteBranches(branchesResult.branches || []);
      
      // Set default branch - tracking branch if on this remote, otherwise local branch name
      if (pushTrackingBranch?.remote === remote && pushTrackingBranch?.branch) {
        setPushSelectedRemoteBranch(pushTrackingBranch.branch);
      } else {
        setPushSelectedRemoteBranch(pushBranch || '');
      }
    } catch (e) {
      console.error(e);
      setPushError((e as Error).message || 'Failed to load remote branches');
    } finally {
      setPushLoadingBranches(false);
    }
  }

  const handlePushToRemote = async () => {
    if (!pushBranch || !pushSelectedRemote || !pushSelectedRemoteBranch) return;
    
    setIsPushing(true);
    setPushError(null);
    
    try {
      // Determine if we need to set upstream
      const isNewBranch = !pushRemoteBranches.includes(pushSelectedRemoteBranch);
      const needsSetUpstream = isNewBranch || 
        pushTrackingBranch?.remote !== pushSelectedRemote || 
        pushTrackingBranch?.branch !== pushSelectedRemoteBranch;
      
      await runGitAction({
        repoPath,
        action: 'push-to-remote',
        data: {
          localBranch: pushBranch,
          remote: pushSelectedRemote,
          remoteBranch: pushSelectedRemoteBranch,
          rebaseFirst: pushRebaseFirst,
          forcePush: pushForcePush,
          setUpstream: needsSetUpstream,
          squash: pushSquash,
          squashMessage: pushSquashMessage,
        }
      });
      
      // Fetch from the remote we just pushed to
      await runGitAction({
        repoPath,
        action: 'fetch',
        data: { remote: pushSelectedRemote }
      });
      
      setIsPushOpen(false);
      setPushBranch(null);
    } catch (e) {
      console.error(e);
      setPushError((e as Error).message || 'Failed to push to remote');
    } finally {
      setIsPushing(false);
    }
  }

  const confirmPullFromRemote = async (branch: string) => {
    setPullBranch(branch);
    setPullError(null);
    setPullRemotes([]);
    setPullRemoteBranches([]);
    setPullSelectedRemote('');
    setPullSelectedRemoteBranch('');
    setPullTrackingBranch(null);
    setPullRebase(true);
    setIsPullOpen(true);
    
    // Load remotes
    setPullLoadingRemotes(true);
    try {
      const result = await runGitAction({
        repoPath,
        action: 'get-remotes',
        data: {}
      });
      
      if (!result.remotes || result.remotes.length === 0) {
        setPullError('No remote repository configured. Please add a remote first.');
        setPullLoadingRemotes(false);
        return;
      }
      
      setPullRemotes(result.remotes);
      
      // Get tracking branch info
      const trackingResult = await runGitAction({
        repoPath,
        action: 'get-tracking-branch',
        data: { branch }
      });
      
      setPullTrackingBranch(trackingResult.tracking);
      
      // Set default remote - use tracking remote if available and exists in remotes list, otherwise first remote
      const trackingRemote = trackingResult.tracking?.remote;
      const defaultRemote = (trackingRemote && result.remotes.includes(trackingRemote)) 
        ? trackingRemote 
        : result.remotes[0];
      setPullSelectedRemote(defaultRemote);
      
      // Load branches for the default remote
      setPullLoadingBranches(true);
      const branchesResult = await runGitAction({
        repoPath,
        action: 'get-remote-branches',
        data: { remote: defaultRemote }
      });
      
      setPullRemoteBranches(branchesResult.branches || []);
      
      // Set default remote branch - use tracking branch if on same remote
      if (trackingResult.tracking?.remote === defaultRemote && trackingResult.tracking?.branch) {
        setPullSelectedRemoteBranch(trackingResult.tracking.branch);
      } else {
        // No tracking branch on this remote - leave empty to show error
        setPullSelectedRemoteBranch('');
      }
    } catch (e) {
      console.error(e);
      setPullError((e as Error).message || 'Failed to load remote information');
    } finally {
      setPullLoadingRemotes(false);
      setPullLoadingBranches(false);
    }
  }

  const handlePullRemoteChange = async (remote: string) => {
    setPullSelectedRemote(remote);
    setPullLoadingBranches(true);
    setPullRemoteBranches([]);
    setPullSelectedRemoteBranch('');
    
    try {
      const branchesResult = await runGitAction({
        repoPath,
        action: 'get-remote-branches',
        data: { remote }
      });
      
      setPullRemoteBranches(branchesResult.branches || []);
      
      // Set default branch - tracking branch if on this remote
      if (pullTrackingBranch?.remote === remote && pullTrackingBranch?.branch) {
        setPullSelectedRemoteBranch(pullTrackingBranch.branch);
      } else {
        // No tracking branch on this remote - leave empty
        setPullSelectedRemoteBranch('');
      }
    } catch (e) {
      console.error(e);
      setPullError((e as Error).message || 'Failed to load remote branches');
    } finally {
      setPullLoadingBranches(false);
    }
  }

  const handlePullFromRemote = async () => {
    if (!pullBranch || !pullSelectedRemote || !pullSelectedRemoteBranch) return;
    
    setIsPulling(true);
    setPullError(null);
    
    try {
      await runGitAction({
        repoPath,
        action: 'pull-from-remote',
        data: {
          localBranch: pullBranch,
          remote: pullSelectedRemote,
          remoteBranch: pullSelectedRemoteBranch,
          rebase: pullRebase,
        }
      });
      
      setIsPullOpen(false);
      setPullBranch(null);
    } catch (e) {
      console.error(e);
      setPullError((e as Error).message || 'Failed to pull from remote');
    } finally {
      setIsPulling(false);
    }
  }

  const confirmCheckoutToLocal = (remoteBranch: string) => {
    setCheckoutRemoteBranch(remoteBranch);
    // Extract the branch name from remotes/origin/branch-name
    const parts = remoteBranch.split('/');
    // Skip 'remotes' and remote name (e.g., 'origin'), take the rest as branch name
    const branchName = parts.slice(2).join('/');
    setCheckoutLocalBranchName(branchName);
    setIsCheckoutToLocalOpen(true);
  }

  const handleCheckoutToLocal = async () => {
    if (!checkoutRemoteBranch || !checkoutLocalBranchName) return;
    setIsCheckingOutToLocal(true);
    try {
      await runGitAction({
        repoPath,
        action: 'checkout-to-local',
        data: { remoteBranch: checkoutRemoteBranch, localBranch: checkoutLocalBranchName }
      });
      setIsCheckoutToLocalOpen(false);
      setCheckoutRemoteBranch(null);
      setCheckoutLocalBranchName('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsCheckingOutToLocal(false);
    }
  }

  const handleFetchFromAllRemotes = async () => {
    try {
      await runGitAction({
        repoPath,
        action: 'fetch',
        data: { allRemotes: true }
      });
    } catch (e) {
      console.error(e);
    }
  }

  const handleFetchFromRemote = async (remote: string) => {
    try {
      await runGitAction({
        repoPath,
        action: 'fetch',
        data: { remote }
      });
    } catch (e) {
      console.error(e);
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
          <h1 className="font-semibold text-lg">Branches</h1>
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
            {/* Local Branches Group */}
            {localBranchTree && (
              <>
                <GroupHeader
                  name="Branches"
                  groupPath="__local__"
                  icon={<GitBranch className="h-3.5 w-3.5 shrink-0" />}
                  isExpanded={localGroupExpanded}
                  onToggle={handleToggleLocalGroup}
                  visibilityMap={visibilityMap}
                  onToggleVisibility={handleToggleVisibility}
                />
                {localGroupExpanded && (
                  <BranchTreeItem
                    node={localBranchTree}
                    currentBranch={branchData?.current}
                    expandedFolders={expandedFolders}
                    onToggleFolder={toggleFolder}
                    onCheckout={handleCheckout}
                    onCheckoutToLocal={confirmCheckoutToLocal}
                    onCreateBranch={() => setIsCreateBranchOpen(true)}
                    onDeleteBranch={confirmDeleteBranch}
                    onRenameBranch={confirmRenameBranch}
                    onRebase={confirmRebase}
                    onMerge={confirmMerge}
                    onPushToRemote={confirmPushToRemote}
                    onPullFromRemote={confirmPullFromRemote}
                    onBranchClick={handleBranchClick}
                    visibilityMap={visibilityMap}
                    onToggleVisibility={handleToggleVisibility}
                    depth={1}
                    groupPath="__local__"
                    trackingInfo={branchData?.trackingInfo}
                  />
                )}
              </>
            )}
            
            {/* Remote Branches Group */}
            {(hasRemotes || isBranchesLoading) && (
              <>
                <ContextMenu>
                  <ContextMenuTrigger>
                    <GroupHeader
                      name="Remotes"
                      groupPath="__remotes__"
                      icon={<Globe className="h-3.5 w-3.5 shrink-0" />}
                      isExpanded={remotesGroupExpanded}
                      onToggle={handleToggleRemotesGroup}
                      visibilityMap={visibilityMap}
                      onToggleVisibility={handleToggleVisibility}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={handleFetchFromAllRemotes}>
                      Fetch from all remotes
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                {remotesGroupExpanded && isBranchesLoading && !remoteBranchTrees && (
                  <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground" style={{ paddingLeft: '20px' }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading remotes...</span>
                  </div>
                )}
                {remotesGroupExpanded && remoteBranchTrees && Array.from(remoteBranchTrees.entries()).map(([remoteName, tree]) => {
                  const remoteGroupPath = `__remotes__/${remoteName}`;
                  const isRemoteExpanded = expandedFolders.has(remoteGroupPath);
                  
                  return (
                    <div key={remoteName}>
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <GroupHeader
                            name={remoteName}
                            groupPath={remoteGroupPath}
                            icon={<Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            isExpanded={isRemoteExpanded}
                            onToggle={() => toggleFolder(remoteGroupPath)}
                            visibilityMap={visibilityMap}
                            onToggleVisibility={handleToggleVisibility}
                            depth={1}
                          />
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => handleFetchFromRemote(remoteName)}>
                            Fetch from {remoteName}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                      {isRemoteExpanded && (
                        <BranchTreeItem
                          node={tree}
                          currentBranch={branchData?.current}
                          expandedFolders={expandedFolders}
                          onToggleFolder={toggleFolder}
                          onCheckout={handleCheckout}
                          onCheckoutToLocal={confirmCheckoutToLocal}
                          onCreateBranch={() => setIsCreateBranchOpen(true)}
                          onDeleteBranch={confirmDeleteBranch}
                          onRenameBranch={confirmRenameBranch}
                          onRebase={confirmRebase}
                          onMerge={confirmMerge}
                          onPushToRemote={confirmPushToRemote}
                          onPullFromRemote={confirmPullFromRemote}
                          onBranchClick={handleBranchClick}
                          visibilityMap={visibilityMap}
                          onToggleVisibility={handleToggleVisibility}
                          depth={2}
                          groupPath={remoteGroupPath}
                          isRemote={true}
                          trackingInfo={branchData?.trackingInfo}
                        />
                      )}
                    </div>
                  );
                })}
              </>
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
          
          {branchToDelete && !branchToDelete.startsWith('remotes/') && branchData?.trackingInfo?.[branchToDelete] && (
            <div className="flex items-center space-x-2 py-2">
              <Checkbox 
                id="delete-remote-branch" 
                checked={deleteRemoteBranch}
                onCheckedChange={(checked) => setDeleteRemoteBranch(checked === true)}
                disabled={isDeleting}
              />
              <Label htmlFor="delete-remote-branch" className="text-sm font-normal cursor-pointer">
                Delete tracking remote branch <span className="font-mono text-muted-foreground">{branchData.trackingInfo[branchToDelete].upstream}</span>
              </Label>
            </div>
          )}

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
              onChange={e => setNewBranchNameForRename(sanitizeBranchName(e.target.value))}
              placeholder="New branch name"
              disabled={isRenaming}
              onKeyDown={e => {
                if (e.key === 'Enter' && newBranchNameForRename && newBranchNameForRename !== branchToRename && !isRenaming) {
                  handleRenameBranch();
                }
              }}
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

      <Dialog open={isRebaseOpen} onOpenChange={setIsRebaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rebase</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>Copy commits from one branch to another.</p>
                <p>Are you sure to rebase <span className="font-semibold text-foreground">{branchData?.current}</span> onto <span className="font-semibold text-foreground">{rebaseTargetBranch}</span>?</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="stash-changes" 
                checked={rebaseStashChanges}
                onCheckedChange={(checked) => setRebaseStashChanges(checked === true)}
                disabled={isRebasing}
              />
              <Label htmlFor="stash-changes" className="text-sm font-normal cursor-pointer">
                Stash and reapply local changes
              </Label>
            </div>
            {!rebaseStashChanges && (
              <p className="text-xs text-muted-foreground mt-2 ml-6">
                Warning: All local changes will be discarded.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRebaseOpen(false)} disabled={isRebasing}>Cancel</Button>
            <Button onClick={handleRebase} disabled={isRebasing}>
              {isRebasing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMergeOpen} onOpenChange={setIsMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>Merge branch into another one.</p>
                <p>Are you sure to merge <span className="font-semibold text-foreground">{mergeTargetBranch}</span> into <span className="font-semibold text-foreground">{branchData?.current}</span>?</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="rebase-before-merge" 
                checked={mergeRebaseBeforeMerge}
                onCheckedChange={(checked) => setMergeRebaseBeforeMerge(checked === true)}
                disabled={isMerging}
              />
              <Label htmlFor="rebase-before-merge" className="text-sm font-normal cursor-pointer">
                Rebase before merge
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="squash-before-merge" 
                checked={mergeSquash}
                onCheckedChange={(checked) => setMergeSquash(checked === true)}
                disabled={isMerging}
              />
              <Label htmlFor="squash-before-merge" className="text-sm font-normal cursor-pointer">
                Squash before merge
              </Label>
            </div>
            {mergeSquash && (
              <div className="ml-6">
                <Textarea
                  placeholder="Commit message for squash merge"
                  value={mergeSquashMessage}
                  onChange={(e) => setMergeSquashMessage(e.target.value)}
                  disabled={isMerging}
                  className="min-h-20"
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="fast-forward-merge" 
                checked={mergeFastForward}
                onCheckedChange={(checked) => setMergeFastForward(checked === true)}
                disabled={isMerging}
              />
              <Label htmlFor="fast-forward-merge" className="text-sm font-normal cursor-pointer">
                Fast forward merge
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMergeOpen(false)} disabled={isMerging}>Cancel</Button>
            <Button onClick={handleMerge} disabled={isMerging}>
              {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPushOpen} onOpenChange={setIsPushOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push to Remote</DialogTitle>
            <DialogDescription>
              Push <span className="font-semibold text-foreground">{pushBranch}</span> to a remote repository.
            </DialogDescription>
          </DialogHeader>
          
          {pushError && pushRemotes.length === 0 ? (
            // Error state when no remotes
            <div className="py-4">
              <div className="flex items-start gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="text-sm text-muted-foreground">{pushError}</p>
                </div>
              </div>
            </div>
          ) : pushLoadingRemotes ? (
            // Loading state
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            // Normal state with remotes
            <div className="py-2 space-y-4">
              {/* Remote selection */}
              <div className="space-y-2">
                <Label htmlFor="push-remote" className="text-sm font-medium">Remote Repository</Label>
                <Select
                  value={pushSelectedRemote}
                  onValueChange={handlePushRemoteChange}
                  disabled={isPushing}
                >
                  <SelectTrigger id="push-remote">
                    <SelectValue placeholder="Select remote" />
                  </SelectTrigger>
                  <SelectContent>
                    {pushRemotes.map((remote) => (
                      <SelectItem key={remote} value={remote}>
                        {remote}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Remote branch selection */}
              <div className="space-y-2">
                <Label htmlFor="push-remote-branch" className="text-sm font-medium">Remote Branch</Label>
                {pushLoadingBranches ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-muted/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading branches...</span>
                  </div>
                ) : (
                  <Select
                    value={pushSelectedRemoteBranch}
                    onValueChange={setPushSelectedRemoteBranch}
                    disabled={isPushing}
                  >
                    <SelectTrigger id="push-remote-branch">
                      <SelectValue placeholder="Select or create branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Show the local branch name as an option if it doesn't exist on remote */}
                      {pushBranch && !pushRemoteBranches.includes(pushBranch) && (
                        <SelectItem value={pushBranch}>
                          {pushBranch} (new)
                        </SelectItem>
                      )}
                      {pushRemoteBranches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                          {pushTrackingBranch?.remote === pushSelectedRemote && 
                           pushTrackingBranch?.branch === branch && 
                           ' (tracking)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {/* Info message about new branch creation */}
                {pushSelectedRemoteBranch && !pushRemoteBranches.includes(pushSelectedRemoteBranch) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    A new remote branch <span className="font-medium">{pushSelectedRemoteBranch}</span> will be created and tracked by <span className="font-medium">{pushBranch}</span>.
                  </p>
                )}
              </div>
              
              {/* Options */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="push-rebase-first" 
                    checked={pushRebaseFirst}
                    onCheckedChange={(checked) => setPushRebaseFirst(checked === true)}
                    disabled={isPushing}
                  />
                  <Label htmlFor="push-rebase-first" className="text-sm font-normal cursor-pointer">
                    Rebase onto remote branch before pushing
                  </Label>
                </div>
                {!pushRebaseFirst && (
                  <p className="text-xs text-muted-foreground ml-6">
                    Remote branch will be merged into local branch first, then pushed.
                  </p>
                )}
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="push-force" 
                    checked={pushForcePush}
                    onCheckedChange={(checked) => setPushForcePush(checked === true)}
                    disabled={isPushing}
                  />
                  <Label htmlFor="push-force" className="text-sm font-normal cursor-pointer">
                    Force push
                  </Label>
                </div>
                {pushForcePush && (
                  <p className="text-xs text-destructive ml-6">
                    Warning: Force push will overwrite remote history. Use with caution.
                  </p>
                )}

                <div className="flex items-center space-x-2 pt-2 border-t mt-2">
                  <Checkbox 
                    id="push-squash" 
                    checked={pushSquash}
                    onCheckedChange={(checked) => setPushSquash(checked === true)}
                    disabled={isPushing}
                  />
                  <Label htmlFor="push-squash" className="text-sm font-normal cursor-pointer">
                    Squash local commits before push
                  </Label>
                </div>
                {pushSquash && (
                  <div className="ml-6 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      All local commits will be combined into one.
                    </p>
                    <Textarea
                      placeholder="Commit message for squash"
                      value={pushSquashMessage}
                      onChange={(e) => setPushSquashMessage(e.target.value)}
                      disabled={isPushing}
                      className="min-h-[80px]"
                    />
                  </div>
                )}
              </div>
              
              {/* Error message during push */}
              {pushError && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{pushError}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPushOpen(false)} disabled={isPushing}>
              Cancel
            </Button>
            {pushRemotes.length > 0 && (
              <Button 
                onClick={handlePushToRemote} 
                disabled={isPushing || !pushSelectedRemote || !pushSelectedRemoteBranch}
              >
                {isPushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Push
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPullOpen} onOpenChange={setIsPullOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pull from Remote</DialogTitle>
            <DialogDescription>
              Pull changes from a remote branch into <span className="font-semibold text-foreground">{pullBranch}</span>.
            </DialogDescription>
          </DialogHeader>
          
          {pullError && pullRemotes.length === 0 ? (
            // Error state when no remotes
            <div className="py-4">
              <div className="flex items-start gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="text-sm text-muted-foreground">{pullError}</p>
                </div>
              </div>
            </div>
          ) : pullLoadingRemotes ? (
            // Loading state
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            // Normal state with remotes
            <div className="py-2 space-y-4">
              {/* Remote selection */}
              <div className="space-y-2">
                <Label htmlFor="pull-remote" className="text-sm font-medium">Remote Repository</Label>
                <Select
                  value={pullSelectedRemote}
                  onValueChange={handlePullRemoteChange}
                  disabled={isPulling}
                >
                  <SelectTrigger id="pull-remote">
                    <SelectValue placeholder="Select remote" />
                  </SelectTrigger>
                  <SelectContent>
                    {pullRemotes.map((remote) => (
                      <SelectItem key={remote} value={remote}>
                        {remote}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Remote branch selection */}
              <div className="space-y-2">
                <Label htmlFor="pull-remote-branch" className="text-sm font-medium">Remote Branch</Label>
                {pullLoadingBranches ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-muted/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading branches...</span>
                  </div>
                ) : (
                  <Select
                    value={pullSelectedRemoteBranch}
                    onValueChange={setPullSelectedRemoteBranch}
                    disabled={isPulling}
                  >
                    <SelectTrigger id="pull-remote-branch">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {pullRemoteBranches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                          {pullTrackingBranch?.remote === pullSelectedRemote && 
                           pullTrackingBranch?.branch === branch && 
                           ' (tracking)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {/* Error message when no tracking branch is selected */}
                {!pullLoadingBranches && pullRemoteBranches.length > 0 && !pullSelectedRemoteBranch && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">
                      Branch <span className="font-medium">{pullBranch}</span> has no tracking remote branch on <span className="font-medium">{pullSelectedRemote}</span>. Please select a remote branch to pull from.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Options */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="pull-rebase" 
                    checked={pullRebase}
                    onCheckedChange={(checked) => setPullRebase(checked === true)}
                    disabled={isPulling}
                  />
                  <Label htmlFor="pull-rebase" className="text-sm font-normal cursor-pointer">
                    Rebase onto remote branch
                  </Label>
                </div>
                {!pullRebase && (
                  <p className="text-xs text-muted-foreground ml-6">
                    Remote branch will be merged into local branch instead.
                  </p>
                )}
              </div>
              
              {/* Error message during pull */}
              {pullError && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{pullError}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPullOpen(false)} disabled={isPulling}>
              Cancel
            </Button>
            {pullRemotes.length > 0 && (
              <Button 
                onClick={handlePullFromRemote} 
                disabled={isPulling || !pullSelectedRemote || !pullSelectedRemoteBranch}
              >
                {isPulling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowDown className="h-4 w-4 mr-2" />}
                Pull
              </Button>
            )}
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
              onChange={e => setNewBranchName(sanitizeBranchName(e.target.value))}
              placeholder="Branch name"
              disabled={isCreating}
              onKeyDown={e => {
                if (e.key === 'Enter' && newBranchName && !isCreating) {
                  handleCreateBranch();
                }
              }}
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

      <Dialog open={isCheckoutToLocalOpen} onOpenChange={setIsCheckoutToLocalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout to Local Branch</DialogTitle>
            <DialogDescription>
              Create a local branch from <span className="font-semibold text-foreground">{checkoutRemoteBranch?.replace(/^remotes\//, '')}</span> and set up tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="checkout-local-branch" className="text-sm font-medium">Local Branch Name</Label>
            <Input
              id="checkout-local-branch"
              value={checkoutLocalBranchName}
              onChange={e => setCheckoutLocalBranchName(sanitizeBranchName(e.target.value))}
              placeholder="Local branch name"
              disabled={isCheckingOutToLocal}
              className="mt-2"
              onKeyDown={e => {
                if (e.key === 'Enter' && checkoutLocalBranchName && !isCheckingOutToLocal) {
                  handleCheckoutToLocal();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCheckoutToLocalOpen(false)} disabled={isCheckingOutToLocal}>Cancel</Button>
            <Button onClick={handleCheckoutToLocal} disabled={!checkoutLocalBranchName || isCheckingOutToLocal}>
              {isCheckingOutToLocal ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Checkout'}
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
          {/* Show loading spinner while branches are loading if visibility filters are set */}
          {hasVisibilityFilters && isBranchesLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : (
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
          )}
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
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
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
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                    activeTab === 'changes' 
                      ? "bg-muted text-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  onClick={() => setActiveTab('changes')}
                >
                  Changes
                </button>
                <button
                  className="ml-2 p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                  onClick={() => setSelectedHash(null)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
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
