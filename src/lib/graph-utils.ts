
import { Commit } from './types';

export interface GraphNode extends Commit {
  x: number; // Lane index (0, 1, 2...)
  y: number; // Row index
  color: string;
  paths: GraphPath[];
  isMerge: boolean; // Helper to draw different dot
}

export interface GraphPath {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  type: 'straight' | 'merge' | 'fork';
}

const COLORS = [
  '#f5a623', // Orange (Fork Main)
  '#bd10e0', // Purple
  '#4a90e2', // Blue
  '#7ed321', // Green
  '#d0021b', // Red
  '#50e3c2', // Teal
  '#9013fe', // Violet
];

export function generateGraphData(commits: Commit[]): GraphNode[] {
  const nodes: GraphNode[] = [];
  
  // Mapping of which commit hash is currently "expected" at the bottom of a lane.
  // lanes[i] = "hash123" means lane i is drawing a line downwards towards hash123.
  const lanes: (string | null)[] = []; 
  
  // Track when a lane was last freed to prevent immediate reuse (visual separation)
  // laneFreedAt[i] = rowIndex where lane i became null
  const laneFreedAt: number[] = [];

  // Mapping of generic colors to lanes to keep consistency if possible
  const laneColors: string[] = [];
  
  function getNextFreeLane(currentIndex: number): number {
    for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] === null) {
            const freedAt = laneFreedAt[i] ?? -1;
            // Heuristic: Don't reuse a lane immediately after it was freed.
            // Leave at least 1 empty row (gap) to avoid visual confusion.
            // If freed at row `r`, it is empty in row `r`.
            // We are at `currentIndex`.
            // If we use it now, the node is at `currentIndex`.
            // Visually: Node at `freedAt` (lane i) -> terminated.
            // Next node at `currentIndex` (lane i).
            // Gap = currentIndex - freedAt.
            // We want Gap >= 5 (so there is at least 4 empty units between them).
            // This larger gap helps in spreading parallel branches horizontally as requested.
            if (currentIndex - freedAt >= 5) {
                return i;
            }
        }
    }
    return lanes.length;
  }

  function getColor(lane: number): string {
      if (!laneColors[lane]) {
          laneColors[lane] = COLORS[lane % COLORS.length];
      }
      return laneColors[lane];
  }

  commits.forEach((commit, index) => {
      // 1. Identify ALL lanes pointing to this commit
      const matchingLanes: number[] = [];
      for(let i=0; i<lanes.length; i++) {
          if (lanes[i] === commit.hash) matchingLanes.push(i);
      }
      
      let lane: number;
      if (matchingLanes.length === 0) {
          lane = getNextFreeLane(index);
      } else {
          // Pick the first one as the primary lane for this node
          lane = matchingLanes[0];
      }
      
      // Ensure lanes array is large enough
      while (lanes.length <= lane) {
          lanes.push(null);
          laneFreedAt.push(-1);
      }
      
      // Update color for this lane if needed (though getNextFreeLane usually finds one)
      const color = getColor(lane);

      // 2. Prepare the Node
      const node: GraphNode = {
          ...commit,
          x: lane,
          y: index,
          color,
          paths: [],
          isMerge: commit.parents.length > 1
      };

      // 3. Handle incoming merges (diverging branches in history)
      matchingLanes.forEach(ml => {
          if (ml === lane) return;

          // Draw connection from ml to lane
          // The vertical line from above ended at (ml, index).
          // We connect it to (lane, index).
          // Using y1 = index - 0.5 to simulate curve coming from above.

          node.paths.push({
              x1: ml, y1: index - 0.5,
              x2: lane, y2: index,
              color: getColor(ml),
              type: 'merge'
          });

          // This lane is now finished (merged)
          lanes[ml] = null;
          laneFreedAt[ml] = index;
      });

      // Clear the primary lane too (it reached the node)
      // Note: We might refill it immediately if we have a parent continuation
      lanes[lane] = null;
      laneFreedAt[lane] = index;

      // 4. Draw Vertical "Rails" for ALL other active lanes
      // These are connections from (lane, index) to (lane, index+1) 
      // for branches that just "pass through" this row.
      for (let i = 0; i < lanes.length; i++) {
          // Skip if this lane was one of the matching ones (we already handled it)
          if (matchingLanes.includes(i)) continue;

          if (lanes[i] !== null) {
               node.paths.push({
                   x1: i, y1: index,
                   x2: i, y2: index + 1,
                   color: getColor(i),
                   type: 'straight'
               });
          }
      }

      // 5. Process Parents & Update Lanes for next row
      // We are consuming 'lane' (it was pointing to us). 
      // Now we need lanes to point to our parents.
      
      const parents = commit.parents;
      
      if (parents.length > 0) {
          // Parent 0 takes the current lane (usually)
          const p0 = parents[0];
          
          // Check if Parent 0 is ALREADY active in another lane?
          // (e.g. two branches merging into p0, and we are the second one processing)
          const existingP0Lane = lanes.indexOf(p0);
          
          if (existingP0Lane !== -1) {
              // Merge TO existing lane
              node.paths.push({
                  x1: lane, y1: index,
                  x2: existingP0Lane, y2: index + 1,
                  color: color, 
                  type: 'merge'
              });
              // We don't set lanes[lane] = p0, because p0 is already "owned" by existingP0Lane.
              // This lane effectively ends (merges in).
              // It remains null (set in step 3).
          } else {
              // Standard continuation
              lanes[lane] = p0;
              // It was freed in step 3, but now we reclaim it.
              // So effectively it wasn't freed for valid reuse by others.
              // We don't need to reset laneFreedAt because it's occupied now.

              node.paths.push({
                  x1: lane, y1: index,
                  x2: lane, y2: index + 1,
                  color: color, 
                  type: 'straight'
              });
          }
          
          // Other Parents (Merge Heads)
          for (let i = 1; i < parents.length; i++) {
              const p = parents[i];
              const existingPLane = lanes.indexOf(p);
              
              if (existingPLane !== -1) {
                  // Merge to existing
                   node.paths.push({
                      x1: lane, y1: index,
                      x2: existingPLane, y2: index + 1,
                      color: getColor(existingPLane), 
                      type: 'fork'
                  });
              } else {
                  // New lane for this parent
                  const newLane = getNextFreeLane(index);
                  while (lanes.length <= newLane) {
                      lanes.push(null);
                      laneFreedAt.push(-1);
                  }
                  
                  lanes[newLane] = p;
                  
                  // Draw connection
                   node.paths.push({
                      x1: lane, y1: index,
                      x2: newLane, y2: index + 1,
                      color: getColor(newLane), 
                      type: 'fork'
                  });
              }
          }
      
      }
      
      nodes.push(node);
  });
  
  return nodes;
}
