'use client';

import { useMemo, useRef, useState, useLayoutEffect, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import { Commit } from '@/lib/types';
import { generateGraphData } from '@/lib/graph-utils';
import { cn } from '@/lib/utils';
import { ContextMenu } from '@/components/context-menu';


const ROW_HEIGHT = 24; // Compact rows like Fork
const LANE_WIDTH = 12;
const DOT_SIZE = 3;
const STROKE_WIDTH = 2;

// Helper function to highlight matching text
function HighlightedText({ text, searchQuery }: { text: string; searchQuery: string }) {
    if (!searchQuery || !text) return <>{text}</>;
    
    const query = searchQuery.toLowerCase();
    const lowerText = text.toLowerCase();
    const parts: { text: string; highlighted: boolean }[] = [];
    
    let lastIndex = 0;
    let index = lowerText.indexOf(query);
    
    while (index !== -1) {
        // Add non-matching part
        if (index > lastIndex) {
            parts.push({ text: text.slice(lastIndex, index), highlighted: false });
        }
        // Add matching part (preserve original case)
        parts.push({ text: text.slice(index, index + query.length), highlighted: true });
        lastIndex = index + query.length;
        index = lowerText.indexOf(query, lastIndex);
    }
    
    // Add remaining non-matching part
    if (lastIndex < text.length) {
        parts.push({ text: text.slice(lastIndex), highlighted: false });
    }
    
    if (parts.length === 0) return <>{text}</>;
    
    return (
        <>
            {parts.map((part, i) => 
                part.highlighted ? (
                    <mark key={i} className="bg-warning text-warning-content rounded-sm px-0.5">{part.text}</mark>
                ) : (
                    <span key={i}>{part.text}</span>
                )
            )}
        </>
    );
}

export interface GitGraphHandle {
    scrollToCommit: (hash: string) => boolean;
}

export const GitGraph = forwardRef<GitGraphHandle, {
    commits: Commit[],
    onSelectCommit?: (hash: string, modifiers?: { isMultiSelect: boolean; isRangeSelect: boolean }) => void,
    onResetToCommit?: (hash: string) => void,
    onCherryPickCommit?: (hash: string, message: string) => void,
    onCherryPickSelectedCommits?: () => void,
    onRewordCommit?: (hash: string, message: string, branch: string) => void,
    selectedHash?: string,
    selectedHashes?: Set<string>,
    onEndReached?: () => void,
    isLoadingMore?: boolean,
    currentBranch?: string,
    hiddenBranches?: Set<string>,
    localBranches?: string[]
}>(function GitGraph({
    commits,
    onSelectCommit,
    onResetToCommit,
    onCherryPickCommit,
    onCherryPickSelectedCommits,
    onRewordCommit,
    selectedHash,
    selectedHashes,
    onEndReached,
    isLoadingMore,
    currentBranch,
    hiddenBranches,
    localBranches = []
}, ref) {
    const nodes = useMemo(() => generateGraphData(commits), [commits]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [prevCount, setPrevCount] = useState(0);
    
    // Search state
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Handle Cmd+F to open search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+F (Mac) or Ctrl+F (Windows/Linux)
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setIsSearchOpen(true);
                // Focus input after render
                setTimeout(() => searchInputRef.current?.focus(), 0);
            }
            // Escape to close search
            if (e.key === 'Escape' && isSearchOpen) {
                setIsSearchOpen(false);
                setSearchQuery('');
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen]);
    
    const handleCloseSearch = useCallback(() => {
        setIsSearchOpen(false);
        setSearchQuery('');
    }, []);

    // Expose scrollToCommit function via ref
    useImperativeHandle(ref, () => ({
        scrollToCommit: (hash: string) => {
            if (!nodes || nodes.length === 0) return false;
            
            const index = nodes.findIndex(n => n.hash === hash);
            if (index === -1) return false;
            
            // Scroll to the commit row
            if (scrollRef.current) {
                const scrollTop = index * ROW_HEIGHT - (scrollRef.current.clientHeight / 2) + ROW_HEIGHT / 2;
                scrollRef.current.scrollTop = Math.max(0, scrollTop);
            }
            return true;
        }
    }), [nodes]);

    // Save scroll position
    useLayoutEffect(() => {
        setPrevCount(nodes?.length ?? 0);
    }, [nodes?.length]);

    if (!nodes || nodes.length === 0) return null;

    // Calculate SVG dimensions
    const maxLane = Math.max(...nodes.map(n => n.x), 0);
    const width = (maxLane + 1) * LANE_WIDTH + 20;
    const height = nodes.length * ROW_HEIGHT;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            onEndReached?.();
        }
    };

    return (
        <div className="flex flex-col h-full bg-base-100 overflow-hidden font-mono text-sm select-none">
            {/* Search Input - Sticky on top */}
            {isSearchOpen && (
                <div className="sticky top-0 z-30 bg-base-100 border-b border-base-300 px-2 py-2 flex items-center gap-2">
                    <span className="opacity-50">🔍</span>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search in commits..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input input-bordered input-sm flex-1 text-sm"
                        autoFocus
                    />
                    <div className="tooltip tooltip-left z-50" data-tip="Close search (Esc)">
                        <button
                            onClick={handleCloseSearch}
                            className="btn btn-ghost btn-sm btn-square"
                        >
                            ✖️
                        </button>
                    </div>
                </div>
            )}
            
            <div className="flex-1 overflow-auto h-full max-w-full px-2" onScroll={handleScroll} ref={scrollRef}>
                <div className="relative min-w-full" style={{ height }}>
                    {/* SVG Graph Layout */}
                    <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none z-10">
                        {nodes.map((node) => (
                            <g key={node.hash}>
                                {/* Draw paths */}
                                {node.paths.map((path, i) => {
                                    const x1 = path.x1 * LANE_WIDTH + LANE_WIDTH / 2;
                                    const y1 = path.y1 * ROW_HEIGHT + ROW_HEIGHT / 2;
                                    const x2 = path.x2 * LANE_WIDTH + LANE_WIDTH / 2;
                                    const y2 = path.y2 * ROW_HEIGHT + ROW_HEIGHT / 2;

                                    let d = '';
                                    if (path.type === 'straight') {
                                        d = `M ${x1} ${y1} L ${x2} ${y2}`;
                                    } else {
                                        // Fork/Merge styled Bezier
                                        // Standard cubic bezier: ctrl points at mid-y
                                        const cy1 = y1 + ROW_HEIGHT * 0.5;
                                        const cy2 = y2 - ROW_HEIGHT * 0.5;
                                        d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
                                    }

                                    return (
                                        <path
                                            key={i}
                                            d={d}
                                            stroke={path.color}
                                            strokeWidth={STROKE_WIDTH}
                                            fill="none"
                                            strokeLinecap="round"
                                        />
                                    )
                                })}
                            </g>
                        ))}

                        {/* Draw Nodes on top of all paths to avoid overlap ugliness */}
                        {nodes.map((node) => (
                            <circle
                                key={`dot-${node.hash}`}
                                cx={node.x * LANE_WIDTH + LANE_WIDTH / 2}
                                cy={node.y * ROW_HEIGHT + ROW_HEIGHT / 2}
                                r={DOT_SIZE}
                                fill={node.color}
                                stroke={node.color}
                                strokeWidth={STROKE_WIDTH}
                            />
                        ))}
                    </svg>

                    {/* List Rows */}
                    <div style={{ width: '100%' }}>
                        {nodes.map((node) => {
                            const isSelected = selectedHashes ? selectedHashes.has(node.hash) : selectedHash === node.hash;
                            const selectedCount = selectedHashes?.size ?? (selectedHash ? 1 : 0);
                            const menuItems = [
                                { label: "Reset to here", onClick: () => onResetToCommit?.(node.hash) },
                            ];
                            if (onCherryPickCommit) {
                                menuItems.push({
                                    label: "Cherry-pick commit",
                                    onClick: () => onCherryPickCommit(node.hash, node.message),
                                });
                            }
                            if (onCherryPickSelectedCommits && selectedCount > 1 && isSelected) {
                                menuItems.push({
                                    label: `Cherry-pick ${selectedCount} selected commits`,
                                    onClick: onCherryPickSelectedCommits,
                                });
                            }

                            if (onRewordCommit && localBranches && localBranches.length > 0) {
                                // Clean up refs: remove parentheses and split
                                const refs = node.refs ? node.refs.replace(/[()]/g, '').split(',').map(r => r.trim()) : [];
                                let targetBranch: string | null = null;

                                for (const ref of refs) {
                                    // Handle "HEAD -> branch" format
                                    const cleanRef = ref.replace(/^HEAD\s*->\s*/, '');

                                    // Check if it is in localBranches
                                    if (localBranches.includes(cleanRef)) {
                                        targetBranch = cleanRef;
                                        // Prioritize current branch if found
                                        if (currentBranch && cleanRef === currentBranch) {
                                            break;
                                        }
                                    }
                                }

                                if (targetBranch) {
                                    menuItems.push({
                                        label: "Reword commit",
                                        onClick: () => onRewordCommit(node.hash, node.message, targetBranch!),
                                    });
                                }
                            }

                            return (
                            <ContextMenu key={node.hash} items={menuItems}>
                                <div
                                    className={cn(
                                        "flex items-center hover:bg-base-200 border-b border-base-200 last:border-0 cursor-pointer transition-colors text-xs",
                                        isSelected && "bg-primary/10"
                                    )}
                                    style={{ height: ROW_HEIGHT }}
                                    onClick={(e) => onSelectCommit?.(node.hash, {
                                        isMultiSelect: e.metaKey || e.ctrlKey,
                                        isRangeSelect: e.shiftKey,
                                    })}
                                >
                                    {/* Spacing for Graph */}
                                    <div style={{ width: width, flexShrink: 0 }} />

                                    {/* Content */}
                                    <div className="flex flex-1 gap-4 overflow-hidden pr-4 items-center">
                                        <div className="flex-1 truncate flex items-center gap-2">
                                            {/* Refs Pills */}
                                                                                    {node.refs && node.refs.split(', ').map((refName, idx) => {
                                                                                        // remove potential leading and trailing brackets
                                                                                        const displayName = refName.replace(/^\s*\(|\)\s*$/g, '');
                                                                                        // Clean up "HEAD -> " prefix for display but keep for checking
                                                                                        const cleanDisplayName = displayName.replace(/^HEAD\s*->\s*/, '');                                                
                                                // Skip hidden branches
                                                if (hiddenBranches && (
                                                    hiddenBranches.has(cleanDisplayName) ||
                                                    hiddenBranches.has(`remotes/${cleanDisplayName}`)
                                                )) {
                                                    return null;
                                                }
                                                
                                                // Check if this is the current branch by checking if it contains "HEAD -> branchName"
                                                const isCurrent = currentBranch && (
                                                    displayName === currentBranch || 
                                                    displayName === `HEAD -> ${currentBranch}` ||
                                                    displayName.includes(`HEAD -> ${currentBranch}`)
                                                );
                                                return (
                                                    <span key={idx}
                                                        className={cn(
                                                            "text-[10px] px-1.5 rounded-full border border-current whitespace-nowrap shrink-0",
                                                            isCurrent && "font-bold text-base-content"
                                                        )}
                                                        style={{
                                                            color: isCurrent ? undefined : node.color,
                                                            backgroundColor: `${node.color}15` // 10% opacity
                                                        }}
                                                        title={cleanDisplayName}
                                                    >
                                                        <HighlightedText text={cleanDisplayName} searchQuery={searchQuery} />
                                                    </span>
                                                );
                                            })}
                                            <span className={cn("truncate min-w-0 max-w-[600px]", isSelected ? "font-semibold" : "")} title={node.message}>
                                                <HighlightedText text={node.message} searchQuery={searchQuery} />
                                            </span>
                                        </div>
                                        <div className="w-32 truncate opacity-70 text-right">
                                            <HighlightedText text={node.author_name} searchQuery={searchQuery} />
                                        </div>
                                        <div className="w-20 truncate opacity-50 font-mono text-right">
                                            <HighlightedText text={node.hash.substring(0, 7)} searchQuery={searchQuery} />
                                        </div>
                                        <div className="w-32 truncate opacity-70 text-right">
                                            {new Date(node.date).toLocaleString(undefined, {
                                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </ContextMenu>
                            );
                        })}
                        
                        {/* Loading More Indicator */}
                        {isLoadingMore && (
                            <div className="flex items-center justify-center py-8 border-b border-base-300">
                                <span className="loading loading-spinner text-base-content/50"></span>
                                <span className="ml-2 text-sm opacity-70">Loading more commits...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
