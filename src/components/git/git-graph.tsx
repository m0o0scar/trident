'use client';

import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Commit } from '@/lib/types';
import { generateGraphData, GraphNode } from '@/lib/graph-utils';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';


const ROW_HEIGHT = 24; // Compact rows like Fork
const LANE_WIDTH = 16;
const DOT_SIZE = 4;
const STROKE_WIDTH = 2;

export function GitGraph({
    commits,
    onSelectCommit,
    selectedHash,
    onEndReached
}: {
    commits: Commit[],
    onSelectCommit?: (hash: string) => void,
    selectedHash?: string,
    onEndReached?: () => void
}) {
    const nodes = useMemo(() => generateGraphData(commits), [commits]);

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

    const scrollRef = useRef<HTMLDivElement>(null);
    const [prevCount, setPrevCount] = useState(0);

    // Save scroll position
    useLayoutEffect(() => {
        if (nodes.length > prevCount && scrollRef.current) {
            // We added items, the scroll position might stay automatically if we are appending to bottom.
            // If we were prepending, we'd need to adjust.
            // But for infinite scroll down, the browser usually handles it unless we replace the whole DOM.
            // The issue might be the ScrollArea forcing a reset or key change.
        }
        setPrevCount(nodes.length);
    }, [nodes.length, prevCount]);

    return (
        <div className="flex border rounded-md h-full bg-background overflow-hidden font-mono text-sm select-none">
            {/* Graph Column (SVG) + Message Column (combined to ensure alignment) */}
            <ScrollArea className="flex-1 h-full" onScroll={handleScroll} ref={scrollRef}>
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
                                        {node.refs && node.refs.split(', ').map((ref, idx) => (
                                            <span key={idx}
                                                className="text-[10px] px-1.5 rounded-full border truncate max-w-[150px]"
                                                style={{
                                                    borderColor: node.color,
                                                    color: node.color,
                                                    backgroundColor: `${node.color}15` // 10% opacity
                                                }}
                                            >
                                                {ref}
                                            </span>
                                        ))}
                                        <span className={cn("truncate min-w-0 max-w-[600px]", selectedHash === node.hash ? "font-semibold" : "")} title={node.message}>
                                            {node.message}
                                        </span>
                                    </div>
                                    <div className="w-32 truncate text-muted-foreground text-xs text-right">
                                        {node.author_name}
                                    </div>
                                    <div className="w-20 truncate text-muted-foreground text-xs text-right opacity-70 font-mono">
                                        {node.hash}
                                    </div>
                                    <div className="w-32 truncate text-muted-foreground text-xs text-right">
                                        {new Date(node.date).toLocaleString(undefined, {
                                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
