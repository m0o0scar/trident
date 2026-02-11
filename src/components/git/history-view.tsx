'use client';

import { useGitLog, useGitBranches, useGitStatus, useGitAction, useCommitDiff, useCommitFileDiff, CommitFile, useRepository, useUpdateRepository, useSettings, useUpdateSettings } from '@/hooks/use-git';
import { Repository, RepositoryCustomScript, BranchTrackingInfo } from '@/lib/types';
import { GitGraph, GitGraphHandle } from './git-graph';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn, sanitizeBranchName, isFileBinary, isImageFile } from '@/lib/utils';
import { ContextMenu, ContextMenuItem } from '@/components/context-menu';
import { GroupedDiffViewer } from './grouped-diff-viewer';
import { ImageDiffView } from './image-diff-view';
import { useEscapeDismiss } from '@/hooks/use-escape-dismiss';


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

const MIN_HISTORY_PANEL_HEIGHT = 100;
const MAX_HISTORY_PANEL_HEIGHT = 900;
type MergeConflictStatus = 'checking' | 'no-conflict' | 'has-conflicts';
type CommitRowSelectModifiers = { isMultiSelect: boolean; isRangeSelect: boolean };
type ScriptExecutionStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed' | 'canceled';
type ScriptExecutionState = {
  isOpen: boolean;
  executionId: string | null;
  scriptName: string;
  branchRef: string;
  output: string;
  status: ScriptExecutionStatus;
  error: string | null;
};

function clampHistoryPanelHeight(height: number): number {
  return Math.min(Math.max(height, MIN_HISTORY_PANEL_HEIGHT), MAX_HISTORY_PANEL_HEIGHT);
}

function buildCommitMessage(subject: string, body: string): string {
  const trimmedSubject = subject.trim();
  const normalizedBody = body.replace(/\r\n/g, '\n');
  return normalizedBody.trim() ? `${trimmedSubject}\n\n${normalizedBody}` : trimmedSubject;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

const DEFAULT_SCRIPT_EXECUTION: ScriptExecutionState = {
  isOpen: false,
  executionId: null,
  scriptName: '',
  branchRef: '',
  output: '',
  status: 'idle',
  error: null,
};


// File status icon component
function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'A':
      return <i className="iconoir-plus-circle text-[16px] text-success" aria-hidden="true" />;
    case 'D':
      return <i className="iconoir-minus-circle text-[16px] text-error" aria-hidden="true" />;
    case 'M':
      return <i className="iconoir-edit-pencil text-[16px] text-warning" aria-hidden="true" />;
    default:
      return <i className="iconoir-page text-[16px] opacity-50" aria-hidden="true" />;
  }
}

interface CommitFileTreeNode {
  name: string;
  path: string;
  file?: CommitFile;
  children: Map<string, CommitFileTreeNode>;
}

function buildCommitFileTree(files: CommitFile[]): CommitFileTreeNode {
  const root: CommitFileTreeNode = {
    name: '',
    path: '',
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;

      if (i === parts.length - 1) {
        current.file = file;
      }
    }
  }

  return root;
}

function collectCommitFolderPaths(node: CommitFileTreeNode): string[] {
  const paths: string[] = [];
  const children = Array.from(node.children.values());

  children.forEach((child) => {
    if (child.children.size > 0) {
      paths.push(child.path);
      paths.push(...collectCommitFolderPaths(child));
    }
  });

  return paths;
}

function getParentPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean);
  const parentPaths: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    parentPaths.push(parts.slice(0, i).join('/'));
  }

  return parentPaths;
}

function CommitFileTreeItem({
  node,
  selectedFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  depth = 0,
}: {
  node: CommitFileTreeNode;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  depth?: number;
}) {
  const children = Array.from(node.children.values()).sort((a, b) => {
    const aIsFolder = a.children.size > 0;
    const bIsFolder = b.children.size > 0;

    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {children.map((child) => {
        const isFolder = child.children.size > 0;

        if (isFolder) {
          const isExpanded = expandedFolders.has(child.path);

          return (
            <div key={child.path}>
              <div
                className="flex items-center gap-1 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-base-200 transition-colors opacity-80"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onToggleFolder(child.path)}
                title={child.path}
              >
                <span className="text-[10px] opacity-70">{isExpanded ? '▼' : '▶'}</span>
                <i className="iconoir-folder text-[14px] opacity-70" aria-hidden="true" />
                <span className="truncate flex-1">{child.name}</span>
              </div>
              {isExpanded && (
                <CommitFileTreeItem
                  node={child}
                  selectedFile={selectedFile}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        if (!child.file) return null;
        const file = child.file;

        return (
          <div
            key={child.path}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-base-200 transition-colors",
              selectedFile === file.path && "bg-base-200 font-medium"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => onSelectFile(file.path)}
            title={file.path}
          >
            <FileStatusIcon status={file.status} />
            <span className="truncate flex-1 font-mono">{child.name}</span>
          </div>
        );
      })}
    </>
  );
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
    return <div className="flex items-center justify-center p-8"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center p-8 opacity-50">No diff available</div>;
  }

  if (isImageFile(filePath)) {
    return <ImageDiffView filePath={filePath} imageDiff={data.imageDiff} />;
  }

  // Check if file is binary (first by extension, then by content if unknown)
  const isBinary = isFileBinary(filePath, data.left, data.right);

  if (isBinary) {
    return <div className="flex items-center justify-center p-8 opacity-50">Binary file - diff not available</div>;
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
        <i className="iconoir-warning-triangle text-[32px] text-warning" aria-hidden="true" />
        <div className="space-y-2">
          <h3 className="font-bold text-lg">Large Diff Detected</h3>
          <p className="opacity-70">
            This diff is large ({Math.round(contentSize / 1024)}KB, ~{lineCount} lines) and may freeze your browser if rendered.
          </p>
        </div>
        <button className="btn btn-outline" onClick={() => setRenderAnyway(true)}>
          Show Diff Anyway
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <GroupedDiffViewer
        oldValue={data.left || ''}
        newValue={data.right || ''}
        splitView={splitView}
        useDarkTheme={resolvedTheme === 'dark'}
      />
    </div>
  );
}

// Component to show commit changes
function CommitChangesView({ repoPath, commitHash }: { repoPath: string; commitHash: string }) {
  const { data, isLoading } = useCommitDiff(repoPath, commitHash);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [collapsedFoldersByCommit, setCollapsedFoldersByCommit] = useState<Record<string, Set<string>>>({});
  const fileTree = useMemo(() => buildCommitFileTree(data?.files ?? []), [data?.files]);
  const allFolderPaths = useMemo(() => collectCommitFolderPaths(fileTree), [fileTree]);
  const collapsedFolders = useMemo(
    () => collapsedFoldersByCommit[commitHash] ?? new Set<string>(),
    [collapsedFoldersByCommit, commitHash]
  );
  
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

  const expandedFolders = useMemo(() => {
    const expanded = new Set<string>();

    allFolderPaths.forEach((path) => {
      if (!collapsedFolders.has(path)) {
        expanded.add(path);
      }
    });

    if (selectedFile) {
      getParentPaths(selectedFile).forEach((path) => expanded.add(path));
    }

    return expanded;
  }, [allFolderPaths, collapsedFolders, selectedFile]);

  const handleToggleFolder = useCallback((path: string) => {
    setCollapsedFoldersByCommit((prev) => {
      const current = prev[commitHash] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return {
        ...prev,
        [commitHash]: next,
      };
    });
  }, [commitHash]);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 h-full"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (!data || data.files.length === 0) {
    return <div className="flex items-center justify-center p-8 h-full opacity-50">No changes in this commit</div>;
  }

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="w-64 border-r border-base-300 flex flex-col bg-base-200/30 shrink-0">
        <div className="px-3 py-2 text-xs font-bold opacity-70 border-b border-base-300 bg-base-100">
          {data.files.length} file{data.files.length !== 1 ? 's' : ''} changed
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-1">
            <CommitFileTreeItem
              node={fileTree}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectFile={setSelectedFile}
            />
          </div>
        </div>
      </div>

      {/* Diff view */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs font-mono opacity-70 border-b border-base-300 bg-base-100 shrink-0 truncate flex items-center justify-between">
              <span className="truncate">{selectedFile}</span>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <label htmlFor="commit-diff-split-view" className="text-[10px] uppercase tracking-wider font-bold cursor-pointer opacity-70">Split View</label>
                <input
                  type="checkbox"
                  id="commit-diff-split-view"
                  checked={splitView}
                  onChange={(e) => setSplitView(e.target.checked)}
                  className="toggle toggle-xs toggle-primary"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto diff-viewer-wrapper">
              <CommitFileDiffView repoPath={repoPath} commitHash={commitHash} filePath={selectedFile} splitView={splitView} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full opacity-70 text-sm">
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
        "group flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-base-200 transition-colors font-medium",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={onToggle}>
        <span className="text-xs opacity-70">{isExpanded ? '▼' : '▶'}</span>
        <span className="shrink-0">{icon}</span>
        <span className="truncate min-w-0 flex-1">{name}</span>
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
  const title = type === 'visible' 
    ? (isActive ? 'Remove visible filter' : 'Show only this branch')
    : (isActive ? 'Remove hide filter' : 'Hide this branch');

  return (
    <button
      className={cn(
        "p-0.5 rounded hover:bg-base-300 transition-colors shrink-0 cursor-pointer text-xs",
        isActive && "bg-primary/10",
        isInherited && "opacity-50",
        !isActive && !showOnHover && "opacity-0 group-hover:opacity-100"
      )}
      onClick={onClick}
      title={title}
    >
      {type === 'visible' ? <i className="iconoir-eye text-[14px]" aria-hidden="true" /> : <i className="iconoir-eye-closed text-[14px]" aria-hidden="true" />}
    </button>
  );
}

interface BranchMenuCallbacks {
  onCheckout: (branch: string) => void;
  onCheckoutToLocal: (remoteBranch: string) => void;
  onCreateBranch: (sourceBranch: string) => void;
  onDeleteBranch: (branch: string) => void;
  onRenameBranch: (branch: string) => void;
  onRenameRemoteBranch: (branch: string) => void;
  onRebase: (targetBranch: string) => void;
  onMerge: (targetBranch: string) => void;
  onPushToRemote: (branch: string) => void;
  onPullFromRemote: (branch: string) => void;
}

interface BranchMenuOptions {
  branchRef: string;
  branchLeafName: string;
  currentBranch?: string;
  isRemote: boolean;
}

function buildBranchContextMenuItems(
  options: BranchMenuOptions,
  callbacks: BranchMenuCallbacks
): ContextMenuItem[] {
  const { branchRef, branchLeafName, currentBranch, isRemote } = options;
  const isCurrent = !isRemote && branchRef === currentBranch;
  const menuItems: ContextMenuItem[] = [];

  if (!isCurrent && !isRemote) menuItems.push({ label: 'Checkout', onClick: () => callbacks.onCheckout(branchRef) });
  if (isRemote) menuItems.push({ label: 'Checkout to local', onClick: () => callbacks.onCheckoutToLocal(branchRef) });
  menuItems.push({ label: 'Create Branch', onClick: () => callbacks.onCreateBranch(branchRef) });
  if (!isRemote) menuItems.push({ label: 'Rename Branch', onClick: () => callbacks.onRenameBranch(branchRef) });
  if (isRemote) menuItems.push({ label: 'Rename branch', onClick: () => callbacks.onRenameRemoteBranch(branchRef) });
  if (!isRemote) menuItems.push({ label: 'Push to Remote', onClick: () => callbacks.onPushToRemote(branchRef) });
  if (!isRemote) menuItems.push({ label: 'Pull from Remote', onClick: () => callbacks.onPullFromRemote(branchRef) });
  if (!isCurrent) menuItems.push({ label: `Rebase ${currentBranch} onto ${branchLeafName}`, onClick: () => callbacks.onRebase(branchRef) });
  if (!isCurrent) menuItems.push({ label: `Merge ${branchLeafName} into ${currentBranch}`, onClick: () => callbacks.onMerge(branchRef) });
  if (!isCurrent) menuItems.push({ label: isRemote ? 'Delete Remote Branch' : 'Delete Branch', onClick: () => callbacks.onDeleteBranch(branchRef), danger: true });

  return menuItems;
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
  onRenameRemoteBranch,
  onRebase,
  onMerge,
  onPushToRemote,
  onPullFromRemote,
  getBranchContextMenuItems,
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
  onRenameRemoteBranch: (branch: string) => void;
  onRebase: (targetBranch: string) => void;
  onMerge: (targetBranch: string) => void;
  onPushToRemote: (branch: string) => void;
  onPullFromRemote: (branch: string) => void;
  getBranchContextMenuItems: (options: BranchMenuOptions) => ContextMenuItem[];
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
                  "group flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-base-200 transition-colors opacity-70",
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <div className="flex items-center gap-1 flex-1 min-w-0" onClick={() => onToggleFolder(itemPath)}>
                  <span className="text-xs opacity-70">{isExpanded ? '▼' : '▶'}</span>
                  <i className="iconoir-folder text-[16px] shrink-0" aria-hidden="true" />
                  <span className="truncate min-w-0 flex-1">{child.name}</span>
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
                  onRenameRemoteBranch={onRenameRemoteBranch}
                  onRebase={onRebase}
                  onMerge={onMerge}
                  onPushToRemote={onPushToRemote}
                  onPullFromRemote={onPullFromRemote}
                  getBranchContextMenuItems={getBranchContextMenuItems}
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

        const menuItems = getBranchContextMenuItems({
          branchRef: child.fullPath!,
          branchLeafName: child.name,
          currentBranch,
          isRemote,
        });


        return (
          <ContextMenu key={child.fullPath} items={menuItems}>
              <div
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-base-200 transition-colors",
                  isCurrent && "bg-base-200 font-medium text-primary"
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
                    <i className="iconoir-globe text-[14px] opacity-50 shrink-0" aria-hidden="true" />
                  ) : (
                    <i className="iconoir-git-branch text-[14px] opacity-50 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate min-w-0 flex-1" title={child.fullPath}>{child.name}</span>
                  {hasDivergence && (
                    <span 
                      className="flex items-center gap-1 text-xs opacity-70 shrink-0"
                      title={`${branchTracking.ahead} ahead, ${branchTracking.behind} behind ${branchTracking.upstream}`}
                    >
                      {branchTracking.ahead > 0 && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <i className="iconoir-arrow-up text-[12px]" aria-hidden="true" />
                          <span>{branchTracking.ahead}</span>
                        </span>
                      )}
                      {branchTracking.behind > 0 && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <i className="iconoir-arrow-down text-[12px]" aria-hidden="true" />
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
  const { data: statusData } = useGitStatus(repoPath);
  const mergeDestinationBranch = branchData?.current ?? null;
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [selectedCommitHashes, setSelectedCommitHashes] = useState<string[]>([]);
  const [selectionAnchorHash, setSelectionAnchorHash] = useState<string | null>(null);

  const selectSingleCommit = useCallback((hash: string | null) => {
    setSelectedHash(hash);
    setSelectedCommitHashes(hash ? [hash] : []);
    setSelectionAnchorHash(hash);
  }, []);

  // Clear selected commit and close commit details panel when repository changes
  useEffect(() => {
    selectSingleCommit(null);
  }, [repoPath, selectSingleCommit]);

  const { mutateAsync: runGitAction } = useGitAction();
  const [iscreateBranchOpen, setIsCreateBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [createBranchFromRef, setCreateBranchFromRef] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [deleteRemoteBranch, setDeleteRemoteBranch] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isCherryPickOpen, setIsCherryPickOpen] = useState(false);
  const [commitsToCherryPick, setCommitsToCherryPick] = useState<{ hash: string; message: string }[]>([]);
  const [isCherryPicking, setIsCherryPicking] = useState(false);
  const [isAbortCherryPickOpen, setIsAbortCherryPickOpen] = useState(false);
  const [isAbortingCherryPick, setIsAbortingCherryPick] = useState(false);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [branchToRename, setBranchToRename] = useState<string | null>(null);
  const [remoteBranchToRename, setRemoteBranchToRename] = useState<{ remote: string; branch: string } | null>(null);
  const [newBranchNameForRename, setNewBranchNameForRename] = useState('');
  const [renameTrackingRemoteBranch, setRenameTrackingRemoteBranch] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  const [isRebaseOpen, setIsRebaseOpen] = useState(false);
  const [rebaseTargetBranch, setRebaseTargetBranch] = useState<string | null>(null);
  const [rebaseStashChanges, setRebaseStashChanges] = useState(true);
  const [isRebasing, setIsRebasing] = useState(false);
  const [rebaseConflictStatus, setRebaseConflictStatus] = useState<MergeConflictStatus>('checking');

  const closeRebaseDialog = useCallback(() => {
    setIsRebaseOpen(false);
    setRebaseTargetBranch(null);
    setRebaseConflictStatus('checking');
  }, []);

  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeTargetBranch, setMergeTargetBranch] = useState<string | null>(null);
  const [mergeRebaseBeforeMerge, setMergeRebaseBeforeMerge] = useState(false);
  const [mergeSquash, setMergeSquash] = useState(false);
  const [mergeFastForward, setMergeFastForward] = useState(false);
  const [mergeSquashMessage, setMergeSquashMessage] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeConflictStatus, setMergeConflictStatus] = useState<MergeConflictStatus>('checking');

  const closeMergeDialog = useCallback(() => {
    setIsMergeOpen(false);
    setMergeTargetBranch(null);
    setMergeConflictStatus('checking');
  }, []);

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

  // Reset to commit dialog state
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetCommitHash, setResetCommitHash] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const [isRewordOpen, setIsRewordOpen] = useState(false);
  const [commitToReword, setCommitToReword] = useState<{ hash: string; subject: string; body: string; branch: string } | null>(null);
  const [newMessageSubject, setNewMessageSubject] = useState('');
  const [newMessageBody, setNewMessageBody] = useState('');
  const [isRewording, setIsRewording] = useState(false);

  // Ref for GitGraph to scroll to commits
  const gitGraphRef = useRef<GitGraphHandle>(null);
  
  // State for pending scroll to branch commit
  const [pendingScrollCommit, setPendingScrollCommit] = useState<string | null>(null);
  const [isBranchPopoverOpen, setIsBranchPopoverOpen] = useState(false);
  const branchPopoverRef = useRef<HTMLDivElement>(null);
  const [scriptExecution, setScriptExecution] = useState<ScriptExecutionState>(DEFAULT_SCRIPT_EXECUTION);
  const [isCancelingScriptExecution, setIsCancelingScriptExecution] = useState(false);
  const [isCopyingScriptOutput, setIsCopyingScriptOutput] = useState(false);
  const [didCopyScriptOutput, setDidCopyScriptOutput] = useState(false);
  const isScriptExecutionRunning = scriptExecution.status === 'starting' || scriptExecution.status === 'running';
  const isScriptExecutionFinished = scriptExecution.status === 'completed' || scriptExecution.status === 'failed' || scriptExecution.status === 'canceled';
  const closeRewordDialog = useCallback(() => {
    setIsRewordOpen(false);
    setCommitToReword(null);
    setNewMessageSubject('');
    setNewMessageBody('');
  }, []);

  const closeTopPopup = useCallback(() => {
    if (isAbortCherryPickOpen) {
      setIsAbortCherryPickOpen(false);
      setCommitsToCherryPick([]);
      return;
    }
    if (isCheckoutToLocalOpen) {
      setIsCheckoutToLocalOpen(false);
      return;
    }
    if (iscreateBranchOpen) {
      setIsCreateBranchOpen(false);
      setCreateBranchFromRef(null);
      return;
    }
    if (isPullOpen) {
      setIsPullOpen(false);
      return;
    }
    if (isPushOpen) {
      setIsPushOpen(false);
      return;
    }
    if (isMergeOpen) {
      closeMergeDialog();
      return;
    }
    if (isRebaseOpen) {
      closeRebaseDialog();
      return;
    }
    if (isRenameOpen) {
      setIsRenameOpen(false);
      setBranchToRename(null);
      setRemoteBranchToRename(null);
      setNewBranchNameForRename('');
      setRenameTrackingRemoteBranch(false);
      return;
    }
    if (isCherryPickOpen) {
      setIsCherryPickOpen(false);
      setCommitsToCherryPick([]);
      return;
    }
    if (isDeleteOpen) {
      setIsDeleteOpen(false);
      return;
    }
    if (isRewordOpen) {
      closeRewordDialog();
      return;
    }
    if (isResetOpen) {
      setIsResetOpen(false);
      return;
    }
    if (isBranchPopoverOpen) {
      setIsBranchPopoverOpen(false);
      return;
    }
    if (scriptExecution.isOpen && isScriptExecutionFinished) {
      setScriptExecution(DEFAULT_SCRIPT_EXECUTION);
      setDidCopyScriptOutput(false);
      setIsCancelingScriptExecution(false);
    }
  }, [
    isAbortCherryPickOpen,
    isCheckoutToLocalOpen,
    iscreateBranchOpen,
    isPullOpen,
    isPushOpen,
    closeMergeDialog,
    isMergeOpen,
    closeRebaseDialog,
    isRebaseOpen,
    isRenameOpen,
    isCherryPickOpen,
    isDeleteOpen,
    isRewordOpen,
    closeRewordDialog,
    isResetOpen,
    isBranchPopoverOpen,
    scriptExecution.isOpen,
    isScriptExecutionFinished,
  ]);

  const isAnyPopupOpen =
    isResetOpen ||
    isRewordOpen ||
    isDeleteOpen ||
    isAbortCherryPickOpen ||
    isCherryPickOpen ||
    isRenameOpen ||
    isRebaseOpen ||
    isMergeOpen ||
    isPushOpen ||
    isPullOpen ||
    iscreateBranchOpen ||
    isCheckoutToLocalOpen ||
    isBranchPopoverOpen ||
    scriptExecution.isOpen;

  useEscapeDismiss(isAnyPopupOpen, closeTopPopup);

  // Resizable bottom panel state - load from global settings or fallback to localStorage
  const panelHeightStorageKey = 'git-web:history-panel-height';
  const [panelHeight, setPanelHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  
  // Track if user has manually resized the panel to avoid sync loops
  const userHasResized = useRef(false);

  // Load panel height from settings or localStorage
  useEffect(() => {
    if (settings?.historyPanelHeight) {
      setPanelHeight(clampHistoryPanelHeight(settings.historyPanelHeight));
    } else {
      try {
        const stored = localStorage.getItem(panelHeightStorageKey);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed) && parsed >= MIN_HISTORY_PANEL_HEIGHT && parsed <= MAX_HISTORY_PANEL_HEIGHT) {
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
      const newHeight = clampHistoryPanelHeight(resizeRef.current.startHeight + delta);
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

  useEffect(() => {
    if (!isBranchPopoverOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (branchPopoverRef.current && !branchPopoverRef.current.contains(event.target as Node)) {
        setIsBranchPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isBranchPopoverOpen]);

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
  const customBranchScripts = useMemo(() => {
    const scripts = repository?.customScripts ?? [];
    return scripts.filter((script) => (
      script.target === 'branch' &&
      script.action === 'run-bash-script' &&
      script.name.trim().length > 0 &&
      script.content.trim().length > 0
    ));
  }, [repository?.customScripts]);

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

  const selectedCommitHashSet = useMemo(() => new Set(selectedCommitHashes), [selectedCommitHashes]);
  const filteredCommitHashes = useMemo(() => filteredCommits.map((commit) => commit.hash), [filteredCommits]);

  useEffect(() => {
    if (filteredCommitHashes.length === 0) {
      if (selectedHash || selectedCommitHashes.length > 0 || selectionAnchorHash) {
        selectSingleCommit(null);
      }
      return;
    }

    const filteredHashSet = new Set(filteredCommitHashes);
    const nextSelected = selectedCommitHashes.filter((hash) => filteredHashSet.has(hash));

    if (nextSelected.length !== selectedCommitHashes.length) {
      setSelectedCommitHashes(nextSelected);
    }

    if (selectedHash && !filteredHashSet.has(selectedHash)) {
      setSelectedHash(nextSelected.length > 0 ? nextSelected[nextSelected.length - 1] : null);
    }

    if (selectionAnchorHash && !filteredHashSet.has(selectionAnchorHash)) {
      setSelectionAnchorHash(nextSelected.length > 0 ? nextSelected[nextSelected.length - 1] : null);
    }
  }, [filteredCommitHashes, selectedHash, selectedCommitHashes, selectionAnchorHash, selectSingleCommit]);

  const handleSelectCommit = useCallback((hash: string, modifiers?: CommitRowSelectModifiers) => {
    const isRangeSelect = modifiers?.isRangeSelect ?? false;
    const isMultiSelect = modifiers?.isMultiSelect ?? false;

    if (isRangeSelect) {
      const anchor = selectionAnchorHash ?? selectedHash ?? hash;
      const anchorIndex = filteredCommitHashes.indexOf(anchor);
      const targetIndex = filteredCommitHashes.indexOf(hash);

      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        const rangeSelection = filteredCommitHashes.slice(start, end + 1);
        setSelectedCommitHashes(rangeSelection);
        setSelectedHash(hash);
        setSelectionAnchorHash(anchor);
        return;
      }
    }

    if (isMultiSelect) {
      if (selectedCommitHashSet.has(hash)) {
        const nextSelected = selectedCommitHashes.filter((selected) => selected !== hash);
        setSelectedCommitHashes(nextSelected);
        setSelectedHash((prev) => {
          if (prev !== hash) return prev;
          return nextSelected.length > 0 ? nextSelected[nextSelected.length - 1] : null;
        });
        if (selectionAnchorHash === hash) {
          setSelectionAnchorHash(nextSelected.length > 0 ? nextSelected[nextSelected.length - 1] : null);
        }
      } else {
        setSelectedCommitHashes([...selectedCommitHashes, hash]);
        setSelectedHash(hash);
        setSelectionAnchorHash(hash);
      }
      return;
    }

    selectSingleCommit(hash);
  }, [filteredCommitHashes, selectedCommitHashSet, selectedCommitHashes, selectedHash, selectionAnchorHash, selectSingleCommit]);

  const selectedCommitsForCherryPick = useMemo(
    () => filteredCommits.filter((commit) => selectedCommitHashSet.has(commit.hash)).reverse(),
    [filteredCommits, selectedCommitHashSet]
  );

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
          selectSingleCommit(pendingScrollCommit);
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
  }, [pendingScrollCommit, log?.all, isFetching, limit, selectSingleCommit]);

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
        selectSingleCommit(commitHash);
        return;
      }
    }
    
    // Need to load more commits or scroll failed, set pending
    setPendingScrollCommit(commitHash);
    selectSingleCommit(commitHash);
  }, [branchData?.branchCommits, log?.all, selectSingleCommit]);

  const handleRunCustomScript = useCallback(async (script: RepositoryCustomScript, branchRef: string) => {
    setDidCopyScriptOutput(false);
    setIsCancelingScriptExecution(false);
    setScriptExecution({
      isOpen: true,
      executionId: null,
      scriptName: script.name,
      branchRef,
      output: '',
      status: 'starting',
      error: null,
    });

    try {
      const response = await fetch('/api/custom-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'start',
          repoPath,
          branchRef,
          scriptContent: script.content,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to start script execution');
      }

      const prelude: string[] = [];
      if (result.previousBranch && result.checkedOutBranch && result.previousBranch !== result.checkedOutBranch) {
        prelude.push(`[info] Checked out ${result.checkedOutBranch} (from ${result.previousBranch})`);
      }

      setScriptExecution((prev) => ({
        ...prev,
        executionId: result.executionId,
        output: [prelude.join('\n'), result.output].filter(Boolean).join('\n'),
        status: result.status as ScriptExecutionStatus,
        error: null,
      }));
    } catch (error) {
      setScriptExecution((prev) => ({
        ...prev,
        status: 'failed',
        error: (error as Error).message,
        output: prev.output
          ? `${prev.output}\n[error] ${(error as Error).message}`
          : `[error] ${(error as Error).message}`,
      }));
    }
  }, [repoPath]);

  const handleCancelCustomScriptExecution = useCallback(async () => {
    if (!scriptExecution.executionId || !isScriptExecutionRunning) return;

    setIsCancelingScriptExecution(true);
    try {
      const response = await fetch('/api/custom-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'cancel',
          executionId: scriptExecution.executionId,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel script execution');
      }

      setScriptExecution((prev) => ({
        ...prev,
        output: result.output,
        status: result.status as ScriptExecutionStatus,
      }));

      if (result.status !== 'running' && result.status !== 'starting') {
        setIsCancelingScriptExecution(false);
      }
    } catch (error) {
      setScriptExecution((prev) => ({
        ...prev,
        output: `${prev.output}\n[error] ${(error as Error).message}`,
      }));
      setIsCancelingScriptExecution(false);
    }
  }, [scriptExecution.executionId, isScriptExecutionRunning]);

  const handleCopyCustomScriptOutput = useCallback(async () => {
    if (isCopyingScriptOutput) return;

    setIsCopyingScriptOutput(true);
    const copied = await copyText(scriptExecution.output);
    setIsCopyingScriptOutput(false);
    setDidCopyScriptOutput(copied);
    if (copied) {
      setTimeout(() => setDidCopyScriptOutput(false), 1500);
    }
  }, [isCopyingScriptOutput, scriptExecution.output]);

  useEffect(() => {
    if (!scriptExecution.executionId || !isScriptExecutionRunning) return;

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch('/api/custom-scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'status',
            executionId: scriptExecution.executionId,
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch script execution output');
        }

        if (disposed) return;

        const nextStatus = result.status as ScriptExecutionStatus;
        setScriptExecution((prev) => {
          if (prev.executionId !== result.executionId) return prev;
          return {
            ...prev,
            output: result.output,
            status: nextStatus,
            error: null,
          };
        });

        if (nextStatus === 'running') {
          pollTimer = setTimeout(poll, 450);
        } else {
          setIsCancelingScriptExecution(false);
        }
      } catch (error) {
        if (disposed) return;
        setIsCancelingScriptExecution(false);
        setScriptExecution((prev) => ({
          ...prev,
          status: 'failed',
          error: (error as Error).message,
          output: prev.output
            ? `${prev.output}\n[error] ${(error as Error).message}`
            : `[error] ${(error as Error).message}`,
        }));
      }
    };

    void poll();

    return () => {
      disposed = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [scriptExecution.executionId, isScriptExecutionRunning]);

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
    setRemoteBranchToRename(null);
    // Pre-fill with current branch name
    setNewBranchNameForRename(branch);
    setRenameTrackingRemoteBranch(false);
    setIsRenameOpen(true);
  }

  const confirmRenameRemoteBranch = (fullRemoteBranch: string) => {
    const parts = fullRemoteBranch.split('/');
    if (parts.length < 3 || parts[0] !== 'remotes') return;

    const remote = parts[1];
    const branch = parts.slice(2).join('/');
    if (!remote || !branch) return;

    setBranchToRename(fullRemoteBranch);
    setRemoteBranchToRename({ remote, branch });
    setNewBranchNameForRename(branch);
    setRenameTrackingRemoteBranch(false);
    setIsRenameOpen(true);
  }

  const handleRenameBranch = async () => {
    if (!branchToRename || !newBranchNameForRename) return;
    const isSameName = remoteBranchToRename
      ? remoteBranchToRename.branch === newBranchNameForRename
      : branchToRename === newBranchNameForRename;

    if (isSameName) {
      setIsRenameOpen(false);
      setBranchToRename(null);
      setRemoteBranchToRename(null);
      setNewBranchNameForRename('');
      setRenameTrackingRemoteBranch(false);
      return;
    }
    setIsRenaming(true);
    try {
      if (remoteBranchToRename) {
        await runGitAction({
          repoPath,
          action: 'rename-remote-branch',
          data: {
            remote: remoteBranchToRename.remote,
            oldName: remoteBranchToRename.branch,
            newName: newBranchNameForRename,
          }
        });
      } else {
        await runGitAction({
          repoPath,
          action: 'rename-branch',
          data: {
            oldName: branchToRename,
            newName: newBranchNameForRename,
            renameTrackingRemote: renameTrackingRemoteBranch,
          }
        });
      }
      setIsRenameOpen(false);
      setBranchToRename(null);
      setRemoteBranchToRename(null);
      setNewBranchNameForRename('');
      setRenameTrackingRemoteBranch(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRenaming(false);
    }
  }

  const confirmRebase = (targetBranch: string) => {
    setRebaseTargetBranch(targetBranch);
    setRebaseStashChanges(true);
    setRebaseConflictStatus('checking');
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
      closeRebaseDialog();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRebasing(false);
    }
  }

  useEffect(() => {
    const sourceBranch = mergeDestinationBranch;
    const ontoBranch = rebaseTargetBranch;

    if (!isRebaseOpen || !sourceBranch || !ontoBranch) {
      return;
    }

    let cancelled = false;
    setRebaseConflictStatus('checking');

    const checkRebaseConflicts = async () => {
      try {
        const result = await runGitAction({
          repoPath,
          action: 'check-rebase-conflicts',
          data: {
            sourceBranch,
            ontoBranch,
          },
        });

        if (!cancelled) {
          setRebaseConflictStatus(result.hasConflicts ? 'has-conflicts' : 'no-conflict');
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          // Be conservative when the check cannot be completed.
          setRebaseConflictStatus('has-conflicts');
        }
      }
    };

    void checkRebaseConflicts();

    return () => {
      cancelled = true;
    };
  }, [isRebaseOpen, mergeDestinationBranch, rebaseTargetBranch, repoPath, runGitAction]);

  const confirmMerge = (targetBranch: string) => {
    setMergeTargetBranch(targetBranch);
    setMergeRebaseBeforeMerge(false);
    setMergeSquash(false);
    setMergeFastForward(false);
    setMergeSquashMessage('');
    setMergeConflictStatus('checking');
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
      closeMergeDialog();
    } catch (e) {
      console.error(e);
    } finally {
      setIsMerging(false);
    }
  }

  useEffect(() => {
    const sourceBranch = mergeTargetBranch;
    const targetBranch = mergeDestinationBranch;

    if (!isMergeOpen || !sourceBranch || !targetBranch) {
      return;
    }

    let cancelled = false;
    setMergeConflictStatus('checking');

    const checkMergeConflicts = async () => {
      try {
        const result = await runGitAction({
          repoPath,
          action: 'check-merge-conflicts',
          data: {
            sourceBranch,
            targetBranch,
          },
        });

        if (!cancelled) {
          setMergeConflictStatus(result.hasConflicts ? 'has-conflicts' : 'no-conflict');
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          // Be conservative when the check cannot be completed.
          setMergeConflictStatus('has-conflicts');
        }
      }
    };

    void checkMergeConflicts();

    return () => {
      cancelled = true;
    };
  }, [isMergeOpen, mergeTargetBranch, mergeDestinationBranch, repoPath, runGitAction]);

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
          rebaseFirst: pushForcePush ? false : pushRebaseFirst,
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

  const handleResetToCommit = async (commitHash: string) => {
    setResetCommitHash(commitHash);
    setIsResetOpen(true);
  };

  const handleConfirmReset = async () => {
    if (!resetCommitHash) return;
    setIsResetting(true);
    try {
      await runGitAction({
        repoPath,
        action: 'reset',
        data: { commitHash: resetCommitHash, mode: 'hard' }
      });
      setIsResetOpen(false);
      setResetCommitHash(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsResetting(false);
    }
  };

  const confirmRewordCommit = (hash: string, subject: string, body: string, branch: string) => {
    setCommitToReword({ hash, subject, body, branch });
    setNewMessageSubject(subject);
    setNewMessageBody(body);
    setIsRewordOpen(true);
  };

  const handleReword = async () => {
    if (!commitToReword || !newMessageSubject.trim()) return;
    setIsRewording(true);
    try {
      await runGitAction({
        repoPath,
        action: 'reword',
        data: {
          commitHash: commitToReword.hash,
          message: buildCommitMessage(newMessageSubject, newMessageBody),
          branch: commitToReword.branch,
        }
      });
      closeRewordDialog();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRewording(false);
    }
  };

  const confirmCherryPickCommit = (commitHash: string, commitMessage: string) => {
    setCommitsToCherryPick([{ hash: commitHash, message: commitMessage }]);
    setIsCherryPickOpen(true);
  };

  const confirmCherryPickSelectedCommits = () => {
    if (selectedCommitsForCherryPick.length < 2) return;
    setCommitsToCherryPick(selectedCommitsForCherryPick.map((commit) => ({
      hash: commit.hash,
      message: commit.message,
    })));
    setIsCherryPickOpen(true);
  };

  const isCherryPickAlreadyInProgressError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return message.includes('cherry-pick') && message.includes('already in progress');
  };

  const isCherryPickConflictError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('could not apply') ||
      message.includes('conflict') ||
      message.includes('cherry-pick --continue')
    );
  };

  const runCherryPickByHashes = useCallback(async (commitHashes: string[]) => {
    if (commitHashes.length === 1) {
      await runGitAction({
        repoPath,
        action: 'cherry-pick',
        data: { commitHash: commitHashes[0] }
      });
      return;
    }

    await runGitAction({
      repoPath,
      action: 'cherry-pick-multiple',
      data: { commitHashes }
    });
  }, [repoPath, runGitAction]);

  const abortCherryPickAndResetUi = useCallback(async () => {
    try {
      await runGitAction({
        repoPath,
        action: 'cherry-pick-abort',
      });
    } catch (abortError) {
      console.error(abortError);
    } finally {
      setIsCherryPickOpen(false);
      setIsAbortCherryPickOpen(false);
      setCommitsToCherryPick([]);
    }
  }, [repoPath, runGitAction]);

  const handleCherryPickCommit = async () => {
    if (commitsToCherryPick.length === 0) return;
    setIsCherryPicking(true);
    try {
      const commitHashes = commitsToCherryPick.map((commit) => commit.hash);
      await runCherryPickByHashes(commitHashes);
      setIsCherryPickOpen(false);
      setCommitsToCherryPick([]);
    } catch (e) {
      if (isCherryPickAlreadyInProgressError(e)) {
        setIsCherryPickOpen(false);
        setIsAbortCherryPickOpen(true);
      } else if (isCherryPickConflictError(e)) {
        await abortCherryPickAndResetUi();
      }
      console.error(e);
    } finally {
      setIsCherryPicking(false);
    }
  };

  const handleAbortCherryPick = async () => {
    if (commitsToCherryPick.length === 0) {
      setIsAbortCherryPickOpen(false);
      return;
    }

    setIsAbortingCherryPick(true);
    try {
      await runGitAction({
        repoPath,
        action: 'cherry-pick-abort',
      });

      const commitHashes = commitsToCherryPick.map((commit) => commit.hash);
      await runCherryPickByHashes(commitHashes);

      setIsAbortCherryPickOpen(false);
      setCommitsToCherryPick([]);
    } catch (e) {
      if (isCherryPickAlreadyInProgressError(e)) {
        setIsAbortCherryPickOpen(true);
      } else if (isCherryPickConflictError(e)) {
        await abortCherryPickAndResetUi();
      }
      console.error(e);
    } finally {
      setIsAbortingCherryPick(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName) return;
    setIsCreating(true);
    try {
      await runGitAction({
        repoPath,
        action: 'branch',
        data: { branch: newBranchName, fromRef: createBranchFromRef || undefined }
      });
      setIsCreateBranchOpen(false);
      setNewBranchName('');
      setCreateBranchFromRef(null);
    } catch (e) {
      console.error(e);
      // alert or toast error
    } finally {
      setIsCreating(false);
    }
  };

  const confirmCreateBranch = (sourceBranch?: string) => {
    setCreateBranchFromRef(sourceBranch || null);
    setIsCreateBranchOpen(true);
  };

  const currentBranch = branchData?.current;
  const trackingInfoByBranch = branchData?.trackingInfo;
  const trackingInfoForRename = useMemo(() => {
    if (!branchToRename || remoteBranchToRename) return null;
    return trackingInfoByBranch?.[branchToRename] ?? null;
  }, [branchToRename, remoteBranchToRename, trackingInfoByBranch]);
  const localChangesCount = statusData?.files?.length;
  const currentBranchName = currentBranch || (isBranchesLoading ? 'Loading branches...' : 'Detached HEAD');
  const currentBranchLabel = currentBranch && typeof localChangesCount === 'number' && localChangesCount > 0
    ? `${currentBranch} (${localChangesCount})`
    : currentBranchName;
  const currentTrackingBranch = useMemo(() => {
    if (!currentBranch) return null;
    const tracking = trackingInfoByBranch?.[currentBranch];
    if (!tracking?.upstream) return null;
    const slashIndex = tracking.upstream.indexOf('/');
    if (slashIndex <= 0) return null;

    return {
      upstream: tracking.upstream,
      remote: tracking.upstream.slice(0, slashIndex),
      branch: tracking.upstream.slice(slashIndex + 1),
    };
  }, [currentBranch, trackingInfoByBranch]);
  const pullActionDisabledReason = useMemo(() => {
    if (isBranchesLoading) return 'Loading branches...';
    if (!currentBranch) return 'Not on a local branch';
    if (!currentTrackingBranch) return `Branch "${currentBranch}" has no tracking remote branch`;
    return null;
  }, [currentBranch, currentTrackingBranch, isBranchesLoading]);
  const pushActionDisabledReason = useMemo(() => {
    if (isBranchesLoading) return 'Loading branches...';
    if (!currentBranch) return 'Not on a local branch';
    return null;
  }, [currentBranch, isBranchesLoading]);

  const confirmPullCurrentBranch = () => {
    if (!currentBranch || pullActionDisabledReason) return;
    void confirmPullFromRemote(currentBranch);
  };

  const confirmPushCurrentBranch = () => {
    if (!currentBranch || pushActionDisabledReason) return;
    void confirmPushToRemote(currentBranch);
  };

  const getBranchContextMenuItems = (options: BranchMenuOptions): ContextMenuItem[] => {
    const menuItems = buildBranchContextMenuItems(options, {
      onCheckout: handleCheckout,
      onCheckoutToLocal: confirmCheckoutToLocal,
      onCreateBranch: confirmCreateBranch,
      onDeleteBranch: confirmDeleteBranch,
      onRenameBranch: confirmRenameBranch,
      onRenameRemoteBranch: confirmRenameRemoteBranch,
      onRebase: confirmRebase,
      onMerge: confirmMerge,
      onPushToRemote: confirmPushToRemote,
      onPullFromRemote: confirmPullFromRemote,
    });

    if (customBranchScripts.length > 0) {
      menuItems.push({
        label: 'Custom scripts',
        children: customBranchScripts.map((script) => ({
          label: script.name,
          onClick: () => {
            void handleRunCustomScript(script, options.branchRef);
          },
        })),
      });
    }

    return menuItems;
  };

  const localBranchSet = useMemo(() => {
    return new Set(branchData?.branches ?? []);
  }, [branchData?.branches]);

  const remoteBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!branchData?.remotes) return map;

    for (const [remoteName, branches] of Object.entries(branchData.remotes)) {
      for (const branch of branches) {
        map.set(`${remoteName}/${branch}`, `remotes/${remoteName}/${branch}`);
      }
    }

    return map;
  }, [branchData?.remotes]);

  const getBranchTagContextMenuItems = (displayRef: string): ContextMenuItem[] | null => {
    if (localBranchSet.has(displayRef)) {
      return getBranchContextMenuItems({
        branchRef: displayRef,
        branchLeafName: displayRef.split('/').pop() || displayRef,
        currentBranch,
        isRemote: false,
      });
    }

    const remoteBranchRef = remoteBranchMap.get(displayRef);
    if (!remoteBranchRef) return null;

    return getBranchContextMenuItems({
      branchRef: remoteBranchRef,
      branchLeafName: remoteBranchRef.split('/').pop() || displayRef,
      currentBranch,
      isRemote: true,
    });
  };

  const branchTreePopoverContent = (
    <div className="w-[22rem] max-w-[calc(100vw-2rem)] flex flex-col border border-base-300 bg-base-100 rounded-box shadow-xl overflow-hidden">
      <div className="px-4 border-b border-base-300 flex items-center justify-between bg-base-100 h-[57px] shrink-0">
        <h2 className="font-bold text-lg">Branches</h2>
        <div className="flex items-center gap-1">
          {hasVisibilityFilters && (
            <div className="tooltip tooltip-left z-20" data-tip="Clear filters">
              <button
                className="btn btn-ghost btn-xs btn-square"
                onClick={handleClearAllFilters}
              >
                <i className="iconoir-filter text-[16px]" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="tooltip tooltip-left z-20" data-tip="Create Branch">
            <button className="btn btn-ghost btn-xs btn-square" onClick={() => confirmCreateBranch()}>
              <i className="iconoir-plus-circle text-[16px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <div className="p-2 space-y-0.5">
          {localBranchTree && (
            <>
              <GroupHeader
                name="Branches"
                groupPath="__local__"
                icon={<i className="iconoir-git-branch text-[14px]" aria-hidden="true" />}
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
                  onCreateBranch={() => confirmCreateBranch()}
                  onDeleteBranch={confirmDeleteBranch}
                  onRenameBranch={confirmRenameBranch}
                  onRenameRemoteBranch={confirmRenameRemoteBranch}
                  onRebase={confirmRebase}
                  onMerge={confirmMerge}
                  onPushToRemote={confirmPushToRemote}
                  onPullFromRemote={confirmPullFromRemote}
                  getBranchContextMenuItems={getBranchContextMenuItems}
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

          {(hasRemotes || isBranchesLoading) && (
            <>
              <ContextMenu items={[{ label: "Fetch from all remotes", onClick: handleFetchFromAllRemotes }]}>
                <GroupHeader
                  name="Remotes"
                  groupPath="__remotes__"
                  icon={<i className="iconoir-globe text-[14px]" aria-hidden="true" />}
                  isExpanded={remotesGroupExpanded}
                  onToggle={handleToggleRemotesGroup}
                  visibilityMap={visibilityMap}
                  onToggleVisibility={handleToggleVisibility}
                />
              </ContextMenu>
              {remotesGroupExpanded && isBranchesLoading && !remoteBranchTrees && (
                <div className="flex items-center gap-2 px-2 py-2 text-sm opacity-70" style={{ paddingLeft: '20px' }}>
                  <span className="loading loading-spinner loading-xs"></span>
                  <span>Loading remotes...</span>
                </div>
              )}
              {remotesGroupExpanded && remoteBranchTrees && Array.from(remoteBranchTrees.entries()).map(([remoteName, tree]) => {
                const remoteGroupPath = `__remotes__/${remoteName}`;
                const isRemoteExpanded = expandedFolders.has(remoteGroupPath);

                return (
                  <div key={remoteName}>
                    <ContextMenu items={[{ label: `Fetch from ${remoteName}`, onClick: () => handleFetchFromRemote(remoteName) }]}>
                      <GroupHeader
                        name={remoteName}
                        groupPath={remoteGroupPath}
                        icon={<i className="iconoir-globe text-[14px] opacity-50" aria-hidden="true" />}
                        isExpanded={isRemoteExpanded}
                        onToggle={() => toggleFolder(remoteGroupPath)}
                        visibilityMap={visibilityMap}
                        onToggleVisibility={handleToggleVisibility}
                        depth={1}
                      />
                    </ContextMenu>
                    {isRemoteExpanded && (
                      <BranchTreeItem
                        node={tree}
                        currentBranch={branchData?.current}
                        expandedFolders={expandedFolders}
                        onToggleFolder={toggleFolder}
                        onCheckout={handleCheckout}
                        onCheckoutToLocal={confirmCheckoutToLocal}
                        onCreateBranch={() => confirmCreateBranch()}
                        onDeleteBranch={confirmDeleteBranch}
                        onRenameBranch={confirmRenameBranch}
                        onRenameRemoteBranch={confirmRenameRemoteBranch}
                        onRebase={confirmRebase}
                        onMerge={confirmMerge}
                        onPushToRemote={confirmPushToRemote}
                        onPullFromRemote={confirmPullFromRemote}
                        getBranchContextMenuItems={getBranchContextMenuItems}
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
      </div>
    </div>
  );

  if (isLoading && limit === 100) {
    return <div className="flex items-center justify-center p-8 h-full"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 h-full flex-col gap-4">
        <p className="text-error font-medium">Error Loading History</p>
        <p className="text-sm opacity-70">{(error as Error)?.message || 'An unknown error occurred'}</p>
        <button onClick={() => refetch()} className="btn btn-outline btn-sm">
            <i className="iconoir-refresh-circle text-[16px] mr-1" aria-hidden="true" />
            Try Again
        </button>
      </div>
    );
  }

  if (!log) return <div className="flex items-center justify-center p-8 h-full opacity-70">No history data available</div>;

  return (
    <div className="flex h-full overflow-hidden">
      {isResetOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Reset to Commit</h3>
            <p className="py-4 break-words">
              Are you sure you want to hard reset the current branch to commit <span className="font-mono bg-base-200 px-1 rounded">{resetCommitHash?.substring(0, 7)}</span>?
              <br/>
              <span className="text-error font-bold">Warning: This will discard all local changes and commits after this point. This action cannot be undone.</span>
            </p>
            <div className="modal-action">
              <button className="btn" onClick={() => setIsResetOpen(false)} disabled={isResetting}>Cancel</button>
              <button className="btn btn-error" onClick={handleConfirmReset} disabled={isResetting}>
                {isResetting && <span className="loading loading-spinner loading-xs"></span>}
                Reset
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setIsResetOpen(false)}>close</button>
          </form>
        </dialog>
      )}

      {isRewordOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Reword Commit</h3>
            <p className="py-4 break-words">
              Reword commit <span className="font-mono bg-base-200 px-1 rounded">{commitToReword?.hash.substring(0, 7)}</span> on branch <span className="font-bold">{commitToReword?.branch}</span>.
            </p>
            <input
              type="text"
              className="input input-bordered w-full font-mono text-sm mb-3"
              value={newMessageSubject}
              onChange={e => setNewMessageSubject(e.target.value)}
              autoFocus
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && newMessageSubject.trim() && !isRewording) {
                  e.preventDefault();
                  handleReword();
                }
              }}
              placeholder="Commit subject"
              disabled={isRewording}
            />
            <textarea
                className="textarea textarea-bordered w-full h-32 font-mono text-sm"
                value={newMessageBody}
                onChange={e => setNewMessageBody(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && newMessageSubject.trim() && !isRewording) {
                    e.preventDefault();
                    handleReword();
                  }
                }}
                placeholder="Commit message body (optional)"
                disabled={isRewording}
            />
            {commitToReword?.branch !== branchData?.current && (
                <div className="alert alert-warning text-xs mt-2 py-2">
                    <span>This will briefly checkout <b>{commitToReword?.branch}</b> to amend the commit.</span>
                </div>
            )}
            <div className="modal-action">
              <button className="btn" onClick={closeRewordDialog} disabled={isRewording}>Cancel</button>
              <button className="btn btn-primary" onClick={handleReword} disabled={!newMessageSubject.trim() || isRewording}>
                {isRewording && <span className="loading loading-spinner loading-xs"></span>}
                Reword
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={closeRewordDialog}>close</button>
          </form>
        </dialog>
      )}

      {isDeleteOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete Branch</h3>
            <p className="py-4 break-words">
              Are you sure you want to delete the branch <span className="font-bold break-all">{branchToDelete?.startsWith('remotes/') ? branchToDelete.slice('remotes/'.length) : branchToDelete}</span>?
              This action cannot be undone.
            </p>
            {branchToDelete && !branchToDelete.startsWith('remotes/') && branchData?.trackingInfo?.[branchToDelete] && (
                <div className="form-control">
                <label className="label cursor-pointer justify-start items-start gap-2 min-w-0">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={deleteRemoteBranch} onChange={(e) => setDeleteRemoteBranch(e.target.checked)} disabled={isDeleting} />
                    <span className="label-text break-words whitespace-normal">Delete tracking remote branch <span className="font-mono opacity-70 break-all">{branchData.trackingInfo[branchToDelete].upstream}</span></span>
                </label>
                </div>
            )}
            <div className="modal-action">
              <button className="btn" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>Cancel</button>
              <button className="btn btn-error" onClick={handleDeleteBranch} disabled={isDeleting}>
                {isDeleting && <span className="loading loading-spinner loading-xs"></span>}
                Delete
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setIsDeleteOpen(false)}>close</button>
          </form>
        </dialog>
      )}

      {isCherryPickOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Cherry Pick</h3>
            <p className="text-sm opacity-70 mt-1">
              {commitsToCherryPick.length > 1
                ? 'Apply selected commits from oldest to newest'
                : 'Apply changes from the selected commit'}
            </p>
            {commitsToCherryPick.length === 1 ? (
              <p className="py-4 break-words">
                Are you sure to apply <span className="font-bold font-mono break-all">{commitsToCherryPick[0]?.hash}</span> <span className="font-bold break-words">{commitsToCherryPick[0]?.message}</span> to <span className="font-bold break-all">{branchData?.current || 'current'}</span> branch?
              </p>
            ) : (
              <div className="py-4 space-y-3">
                <p className="break-words">
                  Are you sure to apply <span className="font-bold">{commitsToCherryPick.length} selected commits</span> to <span className="font-bold break-all">{branchData?.current || 'current'}</span> branch?
                </p>
                <div className="max-h-44 overflow-auto rounded border border-base-300 bg-base-200/40 p-2 space-y-1">
                  {commitsToCherryPick.map((commit) => (
                    <div key={commit.hash} className="text-xs min-w-0">
                      <span className="font-mono opacity-70">{commit.hash.slice(0, 7)}</span>{' '}
                      <span className="break-words">{commit.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setIsCherryPickOpen(false);
                  setCommitsToCherryPick([]);
                }}
                disabled={isCherryPicking}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCherryPickCommit} disabled={isCherryPicking}>
                {isCherryPicking && <span className="loading loading-spinner loading-xs"></span>}
                Confirm
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setIsCherryPickOpen(false);
                setCommitsToCherryPick([]);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {isAbortCherryPickOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Cherry Pick In Progress</h3>
            <p className="text-sm opacity-70 mt-1">Another cherry-pick operation is currently in progress.</p>
            <p className="py-4 break-words">
              Abort the in-progress cherry-pick and continue with {commitsToCherryPick.length > 1 ? 'the selected commits' : 'this commit'}?
            </p>
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setIsAbortCherryPickOpen(false);
                  setCommitsToCherryPick([]);
                }}
                disabled={isAbortingCherryPick}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={() => void handleAbortCherryPick()}
                disabled={isAbortingCherryPick}
              >
                {isAbortingCherryPick && <span className="loading loading-spinner loading-xs"></span>}
                Abort and Continue
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setIsAbortCherryPickOpen(false);
                setCommitsToCherryPick([]);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {isRenameOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">{remoteBranchToRename ? 'Rename Remote Branch' : 'Rename Branch'}</h3>
            <p className="py-4 break-words">
              Enter a new name for the branch <span className="font-bold break-all">{branchToRename}</span>. Press <kbd className="kbd kbd-sm">Cmd</kbd>+<kbd className="kbd kbd-sm">Enter</kbd> to confirm.
            </p>
            <input
                type="text"
                className="input input-bordered w-full"
                value={newBranchNameForRename}
                onChange={e => setNewBranchNameForRename(sanitizeBranchName(e.target.value))}
                placeholder="New branch name"
                disabled={isRenaming}
                autoFocus
                onKeyDown={e => {
                    const shortcutPressed = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
                    const sameName = remoteBranchToRename
                      ? newBranchNameForRename === remoteBranchToRename.branch
                      : newBranchNameForRename === branchToRename;
                    if (shortcutPressed && newBranchNameForRename && !sameName && !isRenaming) {
                        handleRenameBranch();
                    }
                }}
            />
            {!remoteBranchToRename && trackingInfoForRename?.upstream && (
              <div className="form-control mt-2">
                <label className="label cursor-pointer justify-start items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={renameTrackingRemoteBranch}
                    onChange={(e) => setRenameTrackingRemoteBranch(e.target.checked)}
                    disabled={isRenaming}
                  />
                  <span className="label-text break-words whitespace-normal">
                    Also rename tracking remote branch <span className="font-mono opacity-70 break-all">{trackingInfoForRename.upstream}</span>
                  </span>
                </label>
              </div>
            )}
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setIsRenameOpen(false);
                  setBranchToRename(null);
                  setRemoteBranchToRename(null);
                  setNewBranchNameForRename('');
                  setRenameTrackingRemoteBranch(false);
                }}
                disabled={isRenaming}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRenameBranch}
                disabled={
                  !newBranchNameForRename ||
                  (remoteBranchToRename
                    ? newBranchNameForRename === remoteBranchToRename.branch
                    : newBranchNameForRename === branchToRename) ||
                  isRenaming
                }
              >
                {isRenaming && <span className="loading loading-spinner loading-xs"></span>}
                Rename
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setIsRenameOpen(false);
                setBranchToRename(null);
                setRemoteBranchToRename(null);
                setNewBranchNameForRename('');
                setRenameTrackingRemoteBranch(false);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {isRebaseOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Rebase</h3>
            <p className="py-4 break-words">
                Copy commits from one branch to another.<br/>
                Are you sure to rebase <span className="font-bold break-all">{branchData?.current}</span> onto <span className="font-bold break-all">{rebaseTargetBranch}</span>?
            </p>
            <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={rebaseStashChanges} onChange={(e) => setRebaseStashChanges(e.target.checked)} disabled={isRebasing} />
                    <span className="label-text">Stash and reapply local changes</span>
                </label>
            </div>
            {!rebaseStashChanges && (
              <p className="text-xs text-warning mt-2 ml-6">
                Warning: All local changes will be discarded.
              </p>
            )}
            {rebaseConflictStatus === 'checking' ? (
              <div className="alert alert-info text-sm mt-4 py-2">
                <span className="loading loading-spinner loading-xs"></span>
                <span>Checking conflicts for rebasing <span className="font-bold break-all">{branchData?.current}</span> onto <span className="font-bold break-all">{rebaseTargetBranch}</span>...</span>
              </div>
            ) : rebaseConflictStatus === 'no-conflict' ? (
              <div className="alert alert-success text-sm mt-4 py-2">
                <i className="iconoir-check-circle-solid text-[18px]" aria-hidden="true" />
                <span>No conflict: rebasing <span className="font-bold break-all">{branchData?.current}</span> onto <span className="font-bold break-all">{rebaseTargetBranch}</span> will not cause conflicts.</span>
              </div>
            ) : (
              <div className="alert alert-warning text-sm mt-4 py-2">
                <i className="iconoir-warning-circle-solid text-[18px]" aria-hidden="true" />
                <span>Conflicts detected: rebasing <span className="font-bold break-all">{branchData?.current}</span> onto <span className="font-bold break-all">{rebaseTargetBranch}</span> will cause conflicts.</span>
              </div>
            )}
            <div className="modal-action">
              <button className="btn" onClick={closeRebaseDialog} disabled={isRebasing}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRebase} disabled={isRebasing}>
                {isRebasing && <span className="loading loading-spinner loading-xs"></span>}
                Confirm
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={closeRebaseDialog}>close</button>
          </form>
        </dialog>
      )}

      {isMergeOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Merge</h3>
                <p className="py-4 break-words">
                    Merge branch into another one.<br/>
                    Are you sure to merge <span className="font-bold break-all">{mergeTargetBranch}</span> into <span className="font-bold break-all">{branchData?.current}</span>?
                </p>
                <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-2">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={mergeRebaseBeforeMerge} onChange={(e) => setMergeRebaseBeforeMerge(e.target.checked)} disabled={isMerging} />
                        <span className="label-text">Rebase before merge</span>
                    </label>
                </div>
                <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-2">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={mergeSquash} onChange={(e) => setMergeSquash(e.target.checked)} disabled={isMerging} />
                        <span className="label-text">Squash before merge</span>
                    </label>
                </div>
                {mergeSquash && (
                    <textarea
                        className="textarea textarea-bordered w-full mt-2"
                        placeholder="Commit message for squash merge"
                        value={mergeSquashMessage}
                        onChange={(e) => setMergeSquashMessage(e.target.value)}
                        disabled={isMerging}
                        autoFocus
                    />
                )}
                <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-2">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={mergeFastForward} onChange={(e) => setMergeFastForward(e.target.checked)} disabled={isMerging} />
                        <span className="label-text">Fast forward merge</span>
                    </label>
                </div>
                {mergeConflictStatus === 'checking' ? (
                  <div className="alert alert-info text-sm mt-4 py-2">
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Checking conflicts for merging <span className="font-bold break-all">{mergeTargetBranch}</span> into <span className="font-bold break-all">{branchData?.current}</span>...</span>
                  </div>
                ) : mergeConflictStatus === 'no-conflict' ? (
                  <div className="alert alert-success text-sm mt-4 py-2">
                    <i className="iconoir-check-circle-solid text-[18px]" aria-hidden="true" />
                    <span>No conflict: merging <span className="font-bold break-all">{mergeTargetBranch}</span> into <span className="font-bold break-all">{branchData?.current}</span> will not cause conflicts.</span>
                  </div>
                ) : (
                  <div className="alert alert-warning text-sm mt-4 py-2">
                    <i className="iconoir-warning-circle-solid text-[18px]" aria-hidden="true" />
                    <span>Conflicts detected: merging <span className="font-bold break-all">{mergeTargetBranch}</span> into <span className="font-bold break-all">{branchData?.current}</span> will cause conflicts.</span>
                  </div>
                )}
                <div className="modal-action">
                    <button className="btn" onClick={closeMergeDialog} disabled={isMerging}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleMerge} disabled={isMerging}>
                        {isMerging && <span className="loading loading-spinner loading-xs"></span>}
                        Confirm
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={closeMergeDialog}>close</button>
            </form>
        </dialog>
      )}

      {isPushOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Push to Remote</h3>
                <p className="py-4 break-words">Push <span className="font-bold break-all">{pushBranch}</span> to a remote repository.</p>

                {pushError && pushRemotes.length === 0 ? (
                    <div className="alert alert-error">
                        <span className="text-xl">⚠️</span>
                        <span>{pushError}</span>
                    </div>
                ) : pushLoadingRemotes ? (
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-lg"></span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="form-control w-full flex flex-row items-center justify-between gap-4">
                            <label className="label flex-shrink-0"><span className="label-text">Remote Repository</span></label>
                            <select className="select select-bordered w-64" value={pushSelectedRemote} onChange={(e) => handlePushRemoteChange(e.target.value)} disabled={isPushing}>
                                {pushRemotes.map((remote) => <option key={remote} value={remote}>{remote}</option>)}
                            </select>
                        </div>

                        <div className="form-control w-full flex flex-row items-center justify-between gap-4">
                            <label className="label flex-shrink-0"><span className="label-text">Remote Branch</span></label>
                            <div className="flex flex-col items-end gap-1 w-64">
                                {pushLoadingBranches ? (
                                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-base-200 opacity-70 w-full">
                                        <span className="loading loading-spinner loading-xs"></span> Loading branches...
                                    </div>
                                ) : (
                                    <select className="select select-bordered w-full" value={pushSelectedRemoteBranch} onChange={(e) => setPushSelectedRemoteBranch(e.target.value)} disabled={isPushing}>
                                        {pushBranch && !pushRemoteBranches.includes(pushBranch) && <option value={pushBranch}>{pushBranch} (new)</option>}
                                        {pushRemoteBranches.map((branch) => <option key={branch} value={branch}>{branch}{pushTrackingBranch?.remote === pushSelectedRemote && pushTrackingBranch?.branch === branch ? ' (tracking)' : ''}</option>)}
                                    </select>
                                )}
                                {pushSelectedRemoteBranch && !pushRemoteBranches.includes(pushSelectedRemoteBranch) && (
                                    <div className="label"><span className="label-text-alt text-warning">New branch will be created</span></div>
                                )}
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" className="checkbox checkbox-sm" checked={pushRebaseFirst} onChange={(e) => setPushRebaseFirst(e.target.checked)} disabled={isPushing || pushForcePush} />
                                <span className="label-text">Rebase onto remote branch before pushing</span>
                            </label>
                        </div>

                        <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" className="checkbox checkbox-sm checkbox-error" checked={pushForcePush} onChange={(e) => setPushForcePush(e.target.checked)} disabled={isPushing} />
                                <span className="label-text text-error">Force push</span>
                            </label>
                        </div>

                        <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" className="checkbox checkbox-sm" checked={pushSquash} onChange={(e) => setPushSquash(e.target.checked)} disabled={isPushing} />
                                <span className="label-text">Squash local commits before push</span>
                            </label>
                        </div>
                        {pushSquash && (
                            <textarea className="textarea textarea-bordered w-full" placeholder="Commit message for squash" value={pushSquashMessage} onChange={(e) => setPushSquashMessage(e.target.value)} disabled={isPushing} autoFocus />
                        )}

                        {pushError && (
                            <div className="alert alert-error text-sm">
                                <span>{pushError}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="modal-action">
                    <button className="btn" onClick={() => setIsPushOpen(false)} disabled={isPushing}>Cancel</button>
                    {pushRemotes.length > 0 && (
                        <button className="btn btn-primary" onClick={handlePushToRemote} disabled={isPushing || !pushSelectedRemote || !pushSelectedRemoteBranch}>
                            {isPushing && <span className="loading loading-spinner loading-xs"></span>} Push
                        </button>
                    )}
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={() => setIsPushOpen(false)}>close</button>
            </form>
        </dialog>
      )}

      {isPullOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Pull from Remote</h3>
                <p className="py-4 break-words">Pull changes from a remote branch into <span className="font-bold break-all">{pullBranch}</span>.</p>

                {pullError && pullRemotes.length === 0 ? (
                    <div className="alert alert-error"><span>{pullError}</span></div>
                ) : pullLoadingRemotes ? (
                    <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="form-control w-full flex flex-row items-center justify-between gap-4">
                            <label className="label flex-shrink-0"><span className="label-text">Remote Repository</span></label>
                            <select className="select select-bordered w-64" value={pullSelectedRemote} onChange={(e) => handlePullRemoteChange(e.target.value)} disabled={isPulling}>
                                {pullRemotes.map((remote) => <option key={remote} value={remote}>{remote}</option>)}
                            </select>
                        </div>

                        <div className="form-control w-full flex flex-row items-center justify-between gap-4">
                            <label className="label flex-shrink-0"><span className="label-text">Remote Branch</span></label>
                            {pullLoadingBranches ? (
                                <div className="flex items-center gap-2 p-3 border rounded-lg bg-base-200 opacity-70 w-64">
                                    <span className="loading loading-spinner loading-xs"></span> Loading branches...
                                </div>
                            ) : (
                                <select className="select select-bordered w-64" value={pullSelectedRemoteBranch} onChange={(e) => setPullSelectedRemoteBranch(e.target.value)} disabled={isPulling}>
                                    {pullRemoteBranches.map((branch) => <option key={branch} value={branch}>{branch}{pullTrackingBranch?.remote === pullSelectedRemote && pullTrackingBranch?.branch === branch ? ' (tracking)' : ''}</option>)}
                                </select>
                            )}
                        </div>

                        <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" className="checkbox checkbox-sm" checked={pullRebase} onChange={(e) => setPullRebase(e.target.checked)} disabled={isPulling} />
                                <span className="label-text">Rebase onto remote branch</span>
                            </label>
                        </div>

                        {pullError && <div className="alert alert-error text-sm"><span>{pullError}</span></div>}
                    </div>
                )}
                
                <div className="modal-action">
                    <button className="btn" onClick={() => setIsPullOpen(false)} disabled={isPulling}>Cancel</button>
                    {pullRemotes.length > 0 && (
                        <button className="btn btn-primary" onClick={handlePullFromRemote} disabled={isPulling || !pullSelectedRemote || !pullSelectedRemoteBranch}>
                            {isPulling && <span className="loading loading-spinner loading-xs"></span>} Pull
                        </button>
                    )}
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={() => setIsPullOpen(false)}>close</button>
            </form>
        </dialog>
      )}

      {iscreateBranchOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Create New Branch</h3>
                <p className="py-4 break-words">
                  Create a new branch from{' '}
                  <span className="font-bold break-all">
                    {createBranchFromRef ? createBranchFromRef.replace(/^remotes\//, '') : 'current HEAD'}
                  </span>.
                </p>
                <input
                    type="text"
                    className="input input-bordered w-full"
                    value={newBranchName}
                    onChange={e => setNewBranchName(sanitizeBranchName(e.target.value))}
                    placeholder="Branch name"
                    disabled={isCreating}
                    autoFocus
                    onKeyDown={e => {
                        if (e.key === 'Enter' && newBranchName && !isCreating) {
                            handleCreateBranch();
                        }
                    }}
                />
                <div className="modal-action">
                    <button
                      className="btn"
                      onClick={() => {
                        setIsCreateBranchOpen(false);
                        setCreateBranchFromRef(null);
                      }}
                      disabled={isCreating}
                    >
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleCreateBranch} disabled={!newBranchName || isCreating}>
                        {isCreating && <span className="loading loading-spinner loading-xs"></span>} Create & Checkout
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button
                  onClick={() => {
                    setIsCreateBranchOpen(false);
                    setCreateBranchFromRef(null);
                  }}
                >
                  close
                </button>
            </form>
        </dialog>
      )}

      {isCheckoutToLocalOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Checkout to Local Branch</h3>
                <p className="py-4 break-words">Create a local branch from <span className="font-bold break-all">{checkoutRemoteBranch?.replace(/^remotes\//, '')}</span> and set up tracking.</p>
                <div className="form-control w-full">
                    <label className="label"><span className="label-text">Local Branch Name</span></label>
                    <input
                        type="text"
                        className="input input-bordered w-full"
                        value={checkoutLocalBranchName}
                        onChange={e => setCheckoutLocalBranchName(sanitizeBranchName(e.target.value))}
                        placeholder="Local branch name"
                        disabled={isCheckingOutToLocal}
                        autoFocus
                        onKeyDown={e => {
                            if (e.key === 'Enter' && checkoutLocalBranchName && !isCheckingOutToLocal) {
                                handleCheckoutToLocal();
                            }
                        }}
                    />
                </div>
                <div className="modal-action">
                    <button className="btn" onClick={() => setIsCheckoutToLocalOpen(false)} disabled={isCheckingOutToLocal}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleCheckoutToLocal} disabled={!checkoutLocalBranchName || isCheckingOutToLocal}>
                        {isCheckingOutToLocal && <span className="loading loading-spinner loading-xs"></span>} Checkout
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={() => setIsCheckoutToLocalOpen(false)}>close</button>
            </form>
        </dialog>
      )}

      {scriptExecution.isOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-bold text-lg truncate">Custom Script: {scriptExecution.scriptName}</h3>
                <p className="text-xs opacity-70 mt-1 break-all">
                  Branch: {scriptExecution.branchRef}
                </p>
              </div>
              <span
                className={cn(
                  "badge badge-sm shrink-0",
                  scriptExecution.status === 'running' || scriptExecution.status === 'starting'
                    ? 'badge-info'
                    : scriptExecution.status === 'completed'
                      ? 'badge-success'
                      : scriptExecution.status === 'failed'
                        ? 'badge-error'
                        : scriptExecution.status === 'canceled'
                          ? 'badge-warning'
                          : 'badge-ghost'
                )}
              >
                {scriptExecution.status}
              </span>
            </div>

            <div className="mt-4 border border-base-300 rounded bg-base-200/40">
              <pre className="p-3 font-mono text-xs overflow-auto max-h-[50vh] whitespace-pre-wrap break-words">{scriptExecution.output || 'Waiting for output...'}</pre>
            </div>

            {scriptExecution.error && (
              <div className="alert alert-error py-2 mt-3">
                <span>{scriptExecution.error}</span>
              </div>
            )}

            <div className="modal-action">
              <button
                className="btn btn-warning"
                onClick={() => void handleCancelCustomScriptExecution()}
                disabled={!isScriptExecutionRunning || isCancelingScriptExecution}
              >
                {isCancelingScriptExecution && <span className="loading loading-spinner loading-xs"></span>}
                Cancel
              </button>
              <button
                className="btn btn-outline"
                onClick={() => void handleCopyCustomScriptOutput()}
                disabled={isCopyingScriptOutput}
              >
                {isCopyingScriptOutput && <span className="loading loading-spinner loading-xs"></span>}
                {didCopyScriptOutput ? 'Copied' : 'Copy'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setScriptExecution(DEFAULT_SCRIPT_EXECUTION);
                  setDidCopyScriptOutput(false);
                  setIsCancelingScriptExecution(false);
                }}
                disabled={!isScriptExecutionFinished}
              >
                Done
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={(e) => {
                if (!isScriptExecutionFinished) {
                  e.preventDefault();
                  return;
                }
                setScriptExecution(DEFAULT_SCRIPT_EXECUTION);
                setDidCopyScriptOutput(false);
                setIsCancelingScriptExecution(false);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-base-100">
        <div className="h-[57px] flex items-center px-6 border-b border-base-300 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-bold text-lg">History</h1>
            <div className="relative" ref={branchPopoverRef}>
              <button
                className="btn btn-sm gap-2 max-w-[24rem]"
                onClick={() => setIsBranchPopoverOpen(prev => !prev)}
                title={currentBranchLabel}
              >
                <span className="truncate">{currentBranchLabel}</span>
                <i className={cn("iconoir-nav-arrow-down text-[16px] shrink-0 transition-transform", isBranchPopoverOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {isBranchPopoverOpen && (
                <div className="absolute left-0 top-full mt-2 z-50">
                  {branchTreePopoverContent}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="btn btn-sm gap-2"
                onClick={confirmPullCurrentBranch}
                disabled={!!pullActionDisabledReason || isPullOpen || isPushOpen}
                title={pullActionDisabledReason || `Pull from ${currentTrackingBranch?.upstream}`}
              >
                {pullLoadingRemotes ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <i className="iconoir-arrow-down text-[16px]" aria-hidden="true" />
                )}
                Pull
              </button>
              <button
                className="btn btn-sm gap-2"
                onClick={confirmPushCurrentBranch}
                disabled={!!pushActionDisabledReason || isPullOpen || isPushOpen}
                title={pushActionDisabledReason || (currentTrackingBranch ? `Push to ${currentTrackingBranch.upstream}` : 'Push current branch to remote')}
              >
                {pushLoadingRemotes ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <i className="iconoir-arrow-up text-[16px]" aria-hidden="true" />
                )}
                Push
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {/* Show loading spinner while branches are loading if visibility filters are set */}
          {hasVisibilityFilters && isBranchesLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="loading loading-spinner loading-lg opacity-50"></span>
            </div>
          ) : (
            <GitGraph
              ref={gitGraphRef}
              commits={filteredCommits}
              selectedHash={selectedHash || undefined}
              selectedHashes={selectedCommitHashSet}
              onSelectCommit={handleSelectCommit}
              onResetToCommit={handleResetToCommit}
              onCherryPickCommit={confirmCherryPickCommit}
              onCherryPickSelectedCommits={confirmCherryPickSelectedCommits}
              onRewordCommit={confirmRewordCommit}
              localBranches={branchData?.branches || []}
              trackingInfo={branchData?.trackingInfo}
              onEndReached={() => {
                if (!isFetching && log.all.length >= limit) {
                  setLimit(l => l + 50);
                }
              }}
              isLoadingMore={isFetching && limit > 100}
              currentBranch={branchData?.current}
              hiddenBranches={hiddenBranches}
              getBranchTagContextMenuItems={getBranchTagContextMenuItems}
            />
          )}
        </div>

        {selectedHash && (
          <div 
            className="flex flex-col overflow-hidden border-t border-base-300 bg-base-200/30"
            style={{ height: panelHeight }}
          >
            {/* Resize handle */}
            <div 
              className={cn(
                "h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-base-200 transition-colors group shrink-0",
                isResizing && "bg-base-200"
              )}
              onMouseDown={handleResizeStart}
            >
              <div className="w-8 h-1 rounded-full bg-base-300 group-hover:bg-base-content/20 transition-colors" />
            </div>

            {/* Header with commit info */}
            <div className="flex flex-row items-center py-2 px-4 border-b border-base-300 bg-base-100 shrink-0 justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <span className="text-sm font-bold truncate">
                  {log.all.find(c => c.hash === selectedHash)?.message}
                </span>
                <span className="text-xs font-mono opacity-50 shrink-0">
                  {selectedHash.substring(0, 7)}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="ml-2 btn btn-ghost btn-xs btn-square"
                  onClick={() => selectSingleCommit(null)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Combined commit message and changes content */}
            <div className="flex-1 overflow-hidden bg-base-100 flex flex-col">
              <div className="border-b border-base-300 bg-base-100 shrink-0 h-24 flex flex-col">
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold opacity-60">
                  Message
                </div>
                <div className="px-4 pb-3 overflow-auto flex-1 min-h-0">
                  <div className="text-xs opacity-70 whitespace-pre-wrap font-mono">
                    {log.all.find(c => c.hash === selectedHash)?.body || 'No additional message'}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider font-bold opacity-60 border-b border-base-300 bg-base-100 shrink-0">
                  Changes
                </div>
                <div className="flex-1 min-h-0">
                  <CommitChangesView repoPath={repoPath} commitHash={selectedHash} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
