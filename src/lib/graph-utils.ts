
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
  
  // Mapping of generic colors to lanes to keep consistency if possible
  const laneColors: string[] = [];
  
  function getNextFreeLane(): number {
    for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] === null) return i;
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
      // 1. Identify which lane this commit belongs to.
      // It belongs to a lane if that lane is currently "looking for" this commit hash.
      let lane = lanes.indexOf(commit.hash);
      
      // If no lane is looking for me, I am a new tip (e.g. a branch head).
      if (lane === -1) {
          lane = getNextFreeLane();
      }
      
      // Ensure lanes array is large enough
      while (lanes.length <= lane) { lanes.push(null); }
      
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

      // 3. Draw Vertical "Rails" for ALL other active lanes
      // These are connections from (lane, index) to (lane, index+1) 
      // for branches that just "pass through" this row.
      for (let i = 0; i < lanes.length; i++) {
          if (i !== lane && lanes[i] !== null) {
               node.paths.push({
                   x1: i, y1: index,
                   x2: i, y2: index + 1,
                   color: getColor(i),
                   type: 'straight'
               });
          }
      }

      // 4. Process Parents & Update Lanes for next row
      // We are consuming 'lane' (it was pointing to us). 
      // Now we need lanes to point to our parents.
      
      // Clear current lane (we reached the node)
      lanes[lane] = null;
      
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
          } else {
              // Standard continuation
              lanes[lane] = p0;
              node.paths.push({
                  x1: lane, y1: index,
                  x2: lane, y2: index + 1,
                  color: color, 
                  type: 'straight'
              });
          }
          
          // Other Parents (Merge Heads)
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
                  const newLane = getNextFreeLane();
                  while (lanes.length <= newLane) { lanes.push(null); }
                  
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
