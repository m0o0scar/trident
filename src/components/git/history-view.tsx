'use client';

import { useGitLog, useGitBranches, useGitAction, useCommitDiff, useCommitFileDiff, CommitFile, BranchTrackingInfo, useRepository, useUpdateRepository, useSettings, useUpdateSettings } from '@/hooks/use-git';
import { Repository } from '@/lib/types';
import { GitGraph, GitGraphHandle } from './git-graph';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDiffViewer from '@alexbruf/react-diff-viewer';
import '@alexbruf/react-diff-viewer/index.css';
import { useTheme } from 'next-themes';
import { cn, sanitizeBranchName, isFileBinary } from '@/lib/utils';


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
      return <span className="text-success">➕</span>;
    case 'D':
      return <span className="text-error">➖</span>;
    case 'M':
      return <span className="text-warning">📝</span>;
    default:
      return <span className="opacity-50">📄</span>;
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
    return <div className="flex items-center justify-center p-8"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center p-8 opacity-50">No diff available</div>;
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
        <span className="text-4xl text-warning">⚠️</span>
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
            {data.files.map((file) => (
              <div
                key={file.path}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-base-200 transition-colors",
                  selectedFile === file.path && "bg-base-200 font-medium"
                )}
                onClick={() => setSelectedFile(file.path)}
                title={file.path}
              >
                <FileStatusIcon status={file.status} />
                <span className="truncate flex-1 font-mono">{file.path.split('/').pop()}</span>
              </div>
            ))}
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
  const icon = type === 'visible' ? '👁️' : '🚫';
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
      {icon}
    </button>
  );
}

// Custom Context Menu Dropdown
function ContextMenu({ children, items }: { children: React.ReactNode, items: { label: string, onClick: () => void, danger?: boolean }[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const menuRef = useRef<HTMLUListElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Calculate position relative to viewport
        const x = e.clientX;
        const y = e.clientY;
        
        setPosition({ x, y });
        setIsOpen(true);
    };

    // Close menu when clicking outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        // Use setTimeout to avoid immediate closure
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('contextmenu', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 0);

        return () => {
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('contextmenu', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    // Calculate menu width based on content and adjust position if menu would go off-screen
    useEffect(() => {
        if (!isOpen || !menuRef.current) return;

        const menu = menuRef.current;
        
        // Use requestAnimationFrame to ensure styles are applied
        requestAnimationFrame(() => {
            // Calculate optimal width based on content
            // Create a temporary element to measure text width
            const tempElement = document.createElement('div');
            tempElement.style.position = 'absolute';
            tempElement.style.visibility = 'hidden';
            tempElement.style.whiteSpace = 'nowrap';
            tempElement.style.pointerEvents = 'none';
            
            // Copy font styles from menu
            const menuStyles = window.getComputedStyle(menu);
            tempElement.style.fontSize = menuStyles.fontSize;
            tempElement.style.fontFamily = menuStyles.fontFamily;
            tempElement.style.fontWeight = menuStyles.fontWeight;
            tempElement.style.padding = '0.5rem 0.75rem'; // Match menu item padding
            tempElement.style.boxSizing = 'border-box';
            
            document.body.appendChild(tempElement);

            let maxWidth = 0;
            items.forEach(item => {
                tempElement.textContent = item.label;
                const width = tempElement.getBoundingClientRect().width;
                if (width > maxWidth) {
                    maxWidth = width;
                }
            });

            document.body.removeChild(tempElement);

            // Set menu width (add padding: 1rem on each side = 2rem total = 32px)
            const menuWidth = Math.max(maxWidth + 32, 280); // Minimum 280px, or content width + padding
            menu.style.width = `${menuWidth}px`;
            menu.style.minWidth = `${menuWidth}px`;

            // Now adjust position if menu would go off-screen
            const rect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let adjustedX = position.x;
            let adjustedY = position.y;

            // Adjust horizontal position if menu goes off right edge
            if (rect.right > viewportWidth) {
                adjustedX = viewportWidth - rect.width - 10;
            }
            // Adjust horizontal position if menu goes off left edge
            if (adjustedX < 10) {
                adjustedX = 10;
            }

            // Adjust vertical position if menu goes off bottom edge
            if (rect.bottom > viewportHeight) {
                adjustedY = viewportHeight - rect.height - 10;
            }
            // Adjust vertical position if menu goes off top edge
            if (adjustedY < 10) {
                adjustedY = 10;
            }

            if (adjustedX !== position.x || adjustedY !== position.y) {
                menu.style.left = `${adjustedX}px`;
                menu.style.top = `${adjustedY}px`;
            }
        });
    }, [isOpen, position, items]);

    return (
        <div ref={containerRef} className="w-full" onContextMenu={handleContextMenu}>
            {children}
            {isOpen && (
                <ul
                    ref={menuRef}
                    className="fixed z-[9999] menu p-2 shadow-lg bg-base-100 rounded-box border border-base-200"
                    style={{
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                    }}
                >
                    {items.map((item, idx) => (
                        <li key={idx}>
                            <a
                                onClick={(e) => {
                                    e.stopPropagation();
                                    item.onClick();
                                    setIsOpen(false);
                                }}
                                className={cn(item.danger ? "text-error" : "", "whitespace-nowrap")}
                            >
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
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
                  "group flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-base-200 transition-colors opacity-70",
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <div className="flex items-center gap-1 flex-1 min-w-0" onClick={() => onToggleFolder(itemPath)}>
                  <span className="text-xs opacity-70">{isExpanded ? '▼' : '▶'}</span>
                  <span className="text-sm">📁</span>
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

        const menuItems = [];
        if (!isCurrent && !isRemote) menuItems.push({ label: "Checkout", onClick: () => onCheckout(child.fullPath!) });
        if (isRemote) menuItems.push({ label: "Checkout to local...", onClick: () => onCheckoutToLocal(child.fullPath!) });
        menuItems.push({ label: "Create Branch...", onClick: onCreateBranch });
        if (!isRemote) menuItems.push({ label: "Rename Branch...", onClick: () => onRenameBranch(child.fullPath!) });
        if (!isRemote) menuItems.push({ label: "Push to Remote...", onClick: () => onPushToRemote(child.fullPath!) });
        if (!isRemote) menuItems.push({ label: "Pull from Remote...", onClick: () => onPullFromRemote(child.fullPath!) });
        if (!isCurrent) menuItems.push({ label: `Rebase ${currentBranch} onto ${child.name}`, onClick: () => onRebase(child.fullPath!) });
        if (!isCurrent) menuItems.push({ label: `Merge ${child.name} into ${currentBranch}`, onClick: () => onMerge(child.fullPath!) });
        if (!isCurrent) menuItems.push({ label: isRemote ? "Delete Remote Branch..." : "Delete Branch...", onClick: () => onDeleteBranch(child.fullPath!), danger: true });


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
                    <span className="text-xs opacity-50">🌐</span>
                  ) : (
                    <span className="text-xs opacity-50">🌿</span>
                  )}
                  <span className="truncate" title={child.fullPath}>{child.name}</span>
                  {hasDivergence && (
                    <span 
                      className="flex items-center gap-1 text-xs opacity-70 shrink-0"
                      title={`${branchTracking.ahead} ahead, ${branchTracking.behind} behind ${branchTracking.upstream}`}
                    >
                      {branchTracking.ahead > 0 && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <span>⬆️</span>
                          <span>{branchTracking.ahead}</span>
                        </span>
                      )}
                      {branchTracking.behind > 0 && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <span>⬇️</span>
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
    return <div className="flex items-center justify-center p-8 h-full"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 h-full flex-col gap-4">
        <p className="text-error font-medium">Error Loading History</p>
        <p className="text-sm opacity-70">{(error as Error)?.message || 'An unknown error occurred'}</p>
        <button onClick={() => refetch()} className="btn btn-outline btn-sm">
            🔄 Try Again
        </button>
      </div>
    );
  }

  if (!log) return <div className="flex items-center justify-center p-8 h-full opacity-70">No history data available</div>;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Branch Sidebar */}
      <div className="w-64 flex flex-col border-r border-base-300 bg-base-200/30">
        <div className="p-4 border-b border-base-300 flex items-center justify-between bg-base-100 h-[57px]">
          <h1 className="font-bold text-lg">Branches</h1>
          <div className="flex items-center gap-1">
            {hasVisibilityFilters && (
              <button
                className="btn btn-ghost btn-xs btn-square"
                onClick={handleClearAllFilters} 
                title="Clear all filters"
              >
                ✖️
              </button>
            )}
            <button className="btn btn-ghost btn-xs btn-square" onClick={() => setIsCreateBranchOpen(true)} title="Create Branch">
              ➕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-0.5">
            {/* Local Branches Group */}
            {localBranchTree && (
              <>
                <GroupHeader
                  name="Branches"
                  groupPath="__local__"
                  icon={<span className="text-xs">🌿</span>}
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
                <ContextMenu items={[{ label: "Fetch from all remotes", onClick: handleFetchFromAllRemotes }]}>
                    <GroupHeader
                      name="Remotes"
                      groupPath="__remotes__"
                      icon={<span className="text-xs">🌐</span>}
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
                            icon={<span className="text-xs opacity-50">🌐</span>}
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
        </div>
      </div>

      {isDeleteOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete Branch</h3>
            <p className="py-4">
              Are you sure you want to delete the branch <span className="font-bold">{branchToDelete}</span>?
              This action cannot be undone.
            </p>
            {branchToDelete && !branchToDelete.startsWith('remotes/') && branchData?.trackingInfo?.[branchToDelete] && (
                <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={deleteRemoteBranch} onChange={(e) => setDeleteRemoteBranch(e.target.checked)} disabled={isDeleting} />
                    <span className="label-text">Delete tracking remote branch <span className="font-mono opacity-70">{branchData.trackingInfo[branchToDelete].upstream}</span></span>
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

      {isRenameOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Rename Branch</h3>
            <p className="py-4">Enter a new name for the branch <span className="font-bold">{branchToRename}</span>.</p>
            <input
                type="text"
                className="input input-bordered w-full"
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
            <div className="modal-action">
              <button className="btn" onClick={() => setIsRenameOpen(false)} disabled={isRenaming}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRenameBranch} disabled={!newBranchNameForRename || newBranchNameForRename === branchToRename || isRenaming}>
                {isRenaming && <span className="loading loading-spinner loading-xs"></span>}
                Rename
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setIsRenameOpen(false)}>close</button>
          </form>
        </dialog>
      )}

      {isRebaseOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Rebase</h3>
            <p className="py-4">
                Copy commits from one branch to another.<br/>
                Are you sure to rebase <span className="font-bold">{branchData?.current}</span> onto <span className="font-bold">{rebaseTargetBranch}</span>?
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
            <div className="modal-action">
              <button className="btn" onClick={() => setIsRebaseOpen(false)} disabled={isRebasing}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRebase} disabled={isRebasing}>
                {isRebasing && <span className="loading loading-spinner loading-xs"></span>}
                Confirm
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setIsRebaseOpen(false)}>close</button>
          </form>
        </dialog>
      )}

      {isMergeOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Merge</h3>
                <p className="py-4">
                    Merge branch into another one.<br/>
                    Are you sure to merge <span className="font-bold">{branchData?.current}</span> into <span className="font-bold">{mergeTargetBranch}</span>?
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
                    />
                )}
                <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-2">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={mergeFastForward} onChange={(e) => setMergeFastForward(e.target.checked)} disabled={isMerging} />
                        <span className="label-text">Fast forward merge</span>
                    </label>
                </div>
                <div className="modal-action">
                    <button className="btn" onClick={() => setIsMergeOpen(false)} disabled={isMerging}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleMerge} disabled={isMerging}>
                        {isMerging && <span className="loading loading-spinner loading-xs"></span>}
                        Confirm
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={() => setIsMergeOpen(false)}>close</button>
            </form>
        </dialog>
      )}

      {isPushOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Push to Remote</h3>
                <p className="py-4">Push <span className="font-bold">{pushBranch}</span> to a remote repository.</p>

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
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text">Remote Repository</span></label>
                            <select className="select select-bordered" value={pushSelectedRemote} onChange={(e) => handlePushRemoteChange(e.target.value)} disabled={isPushing}>
                                {pushRemotes.map((remote) => <option key={remote} value={remote}>{remote}</option>)}
                            </select>
                        </div>

                        <div className="form-control w-full">
                            <label className="label"><span className="label-text">Remote Branch</span></label>
                            {pushLoadingBranches ? (
                                <div className="flex items-center gap-2 p-3 border rounded-lg bg-base-200 opacity-70">
                                    <span className="loading loading-spinner loading-xs"></span> Loading branches...
                                </div>
                            ) : (
                                <select className="select select-bordered" value={pushSelectedRemoteBranch} onChange={(e) => setPushSelectedRemoteBranch(e.target.value)} disabled={isPushing}>
                                    {pushBranch && !pushRemoteBranches.includes(pushBranch) && <option value={pushBranch}>{pushBranch} (new)</option>}
                                    {pushRemoteBranches.map((branch) => <option key={branch} value={branch}>{branch}{pushTrackingBranch?.remote === pushSelectedRemote && pushTrackingBranch?.branch === branch ? ' (tracking)' : ''}</option>)}
                                </select>
                            )}
                            {pushSelectedRemoteBranch && !pushRemoteBranches.includes(pushSelectedRemoteBranch) && (
                                <div className="label"><span className="label-text-alt text-warning">New branch will be created</span></div>
                            )}
                        </div>

                        <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" className="checkbox checkbox-sm" checked={pushRebaseFirst} onChange={(e) => setPushRebaseFirst(e.target.checked)} disabled={isPushing} />
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
                            <textarea className="textarea textarea-bordered" placeholder="Commit message for squash" value={pushSquashMessage} onChange={(e) => setPushSquashMessage(e.target.value)} disabled={isPushing} />
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
                <p className="py-4">Pull changes from a remote branch into <span className="font-bold">{pullBranch}</span>.</p>

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
                <p className="py-4">Create a new branch from the current HEAD.</p>
                <input
                    type="text"
                    className="input input-bordered w-full"
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
                <div className="modal-action">
                    <button className="btn" onClick={() => setIsCreateBranchOpen(false)} disabled={isCreating}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleCreateBranch} disabled={!newBranchName || isCreating}>
                        {isCreating && <span className="loading loading-spinner loading-xs"></span>} Create & Checkout
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={() => setIsCreateBranchOpen(false)}>close</button>
            </form>
        </dialog>
      )}

      {isCheckoutToLocalOpen && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Checkout to Local Branch</h3>
                <p className="py-4">Create a local branch from <span className="font-bold">{checkoutRemoteBranch?.replace(/^remotes\//, '')}</span> and set up tracking.</p>
                <div className="form-control w-full">
                    <label className="label"><span className="label-text">Local Branch Name</span></label>
                    <input
                        type="text"
                        className="input input-bordered w-full"
                        value={checkoutLocalBranchName}
                        onChange={e => setCheckoutLocalBranchName(sanitizeBranchName(e.target.value))}
                        placeholder="Local branch name"
                        disabled={isCheckingOutToLocal}
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


      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-base-100">
        <div className="h-[57px] flex items-center justify-between px-6 border-b border-base-300 shrink-0">
          <h1 className="font-bold text-lg">History</h1>
          <div className="text-xs opacity-50 font-mono">
            {filteredCommits.length !== log.all.length 
              ? `${filteredCommits.length} / ${log.all.length} commits` 
              : `${log.all.length} commits`
            } {isFetching && <span className="loading loading-spinner loading-xs ml-2"></span>}
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

            {/* Header with commit info and tabs */}
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
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer",
                    activeTab === 'message' 
                      ? "bg-base-200 text-base-content"
                      : "text-base-content/50 hover:text-base-content hover:bg-base-200/50"
                  )}
                  onClick={() => setActiveTab('message')}
                >
                  Message
                </button>
                <button
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer",
                    activeTab === 'changes' 
                      ? "bg-base-200 text-base-content"
                      : "text-base-content/50 hover:text-base-content hover:bg-base-200/50"
                  )}
                  onClick={() => setActiveTab('changes')}
                >
                  Changes
                </button>
                <button
                  className="ml-2 btn btn-ghost btn-xs btn-square"
                  onClick={() => setSelectedHash(null)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden bg-base-100">
              {activeTab === 'message' ? (
                <div className="h-full overflow-auto">
                  <div className="p-4">
                    <div className="text-xs opacity-70 whitespace-pre-wrap font-mono">
                      {log.all.find(c => c.hash === selectedHash)?.body || 'No additional message'}
                    </div>
                  </div>
                </div>
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
