'use client';

import { useMemo, useRef, useState, useLayoutEffect, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import { Commit } from '@/lib/types';
import { generateGraphData, GraphNode } from '@/lib/graph-utils';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';


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
                    <mark key={i} className="bg-yellow-300 dark:bg-yellow-500/50 text-inherit rounded-sm px-0.5">{part.text}</mark>
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
    onSelectCommit?: (hash: string) => void,
    selectedHash?: string,
    onEndReached?: () => void,
    isLoadingMore?: boolean,
    currentBranch?: string,
    hiddenBranches?: Set<string>
}>(function GitGraph({
    commits,
    onSelectCommit,
    selectedHash,
    onEndReached,
    isLoadingMore,
    currentBranch,
    hiddenBranches
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
        if (nodes && nodes.length > prevCount && scrollRef.current) {
            // We added items, the scroll position might stay automatically if we are appending to bottom.
            // If we were prepending, we'd need to adjust.
            // But for infinite scroll down, the browser usually handles it unless we replace the whole DOM.
            // The issue might be the ScrollArea forcing a reset or key change.
        }
        setPrevCount(nodes?.length ?? 0);
    }, [nodes?.length, prevCount]);

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
        <div className="flex flex-col h-full bg-background overflow-hidden font-mono text-sm select-none">
            {/* Search Input - Sticky on top */}
            {isSearchOpen && (
                <div className="sticky top-0 z-20 bg-background border-b px-2 py-2 flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search in commits..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 h-8 text-sm"
                        autoFocus
                    />
                    <button
                        onClick={handleCloseSearch}
                        className="p-1 hover:bg-muted rounded-md transition-colors cursor-pointer"
                        title="Close search (Esc)"
                    >
                        <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            )}
            
            {/* Graph Column (SVG) + Message Column (combined to ensure alignment) */}
            <ScrollArea className="flex-1 h-full max-w-full px-2" onScroll={handleScroll} ref={scrollRef}>
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
                                            strokeWidth={STROKE_WIDTH} z-index={0}
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
                                fill="var(--background)" // Hollow effect (matches bg)
                                stroke={node.color}
                                strokeWidth={STROKE_WIDTH}
                            />
                        ))}
                    </svg>

                    {/* List Rows */}
                    <div style={{ width: '100%' }}>
                        {nodes.map((node, idx) => (
                            <div
                                key={node.hash}
                                className={cn(
                                    "flex items-center hover:bg-muted/50 border-b last:border-0 cursor-pointer transition-colors",
                                    selectedHash === node.hash && "bg-blue-100/40 dark:bg-blue-900/40"
                                )}
                                style={{ height: ROW_HEIGHT }}
                                onClick={() => onSelectCommit?.(node.hash)}
                            >
                                {/* Spacing for Graph */}
                                <div style={{ width: width, flexShrink: 0 }} />

                                {/* Content */}
                                <div className="flex flex-1 gap-4 overflow-hidden pr-4 items-center">
                                    <div className="flex-1 truncate flex items-center gap-2">
                                        {/* Refs Pills */}
                                        {node.refs && node.refs.split(', ').map((refName, idx) => {
                                            // remove potential leading and trailing brackets
                                            let displayName = refName.replace(/^\s*\(|\)\s*$/g, '');
                                            // Clean up "HEAD -> " prefix for display but keep for checking
                                            const cleanDisplayName = displayName.replace(/^HEAD\s*->\s*/, '');
                                            
                                            // Skip hidden branches
                                            // Check both the display name and remotes/ prefixed version
                                            // (remote branches are stored as "remotes/origin/branch" but displayed as "origin/branch")
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
                                                        "text-[10px] px-1.5 rounded-full border whitespace-nowrap shrink-0",
                                                        isCurrent && "font-bold text-black dark:text-white"
                                                    )}
                                                    style={{
                                                        borderColor: node.color,
                                                        color: isCurrent ? undefined : node.color,
                                                        backgroundColor: `${node.color}15` // 10% opacity
                                                    }}
                                                    title={cleanDisplayName}
                                                >
                                                    <HighlightedText text={cleanDisplayName} searchQuery={searchQuery} />
                                                </span>
                                            );
                                        })}
                                        <span className={cn("truncate min-w-0 max-w-[600px] text-xs", selectedHash === node.hash ? "font-semibold" : "")} title={node.message}>
                                            <HighlightedText text={node.message} searchQuery={searchQuery} />
                                        </span>
                                    </div>
                                    <div className="w-32 truncate text-muted-foreground text-xs text-right">
                                        <HighlightedText text={node.author_name} searchQuery={searchQuery} />
                                    </div>
                                    <div className="w-20 truncate text-muted-foreground text-xs text-right opacity-70 font-mono">
                                        <HighlightedText text={node.hash} searchQuery={searchQuery} />
                                    </div>
                                    <div className="w-32 truncate text-muted-foreground text-xs text-right">
                                        {new Date(node.date).toLocaleString(undefined, {
                                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {/* Loading More Indicator */}
                        {isLoadingMore && (
                            <div className="flex items-center justify-center py-8 border-b">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading more commits...</span>
                            </div>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
});
