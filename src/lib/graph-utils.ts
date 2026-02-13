
import { Commit } from './types';
import { getBranchGraphColor } from './branch-colors';

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

function getLaneFallbackColor(lane: number): string {
  const hue = (lane * 47) % 360;
  return `hsl(${hue} 78% 56%)`;
}

function parseBranchRefs(refs?: string): string[] {
  if (!refs) return [];

  return refs
    .replace(/^\s*\((.*)\)\s*$/, '$1')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((ref) => ref.replace(/^HEAD\s*->\s*/, '').trim())
    .filter((ref) => !ref.startsWith('tag:'))
    .filter((ref) => ref !== 'HEAD')
    .filter((ref) => !/\/HEAD$/.test(ref));
}

function getRemoteShortName(ref: string): string | null {
  const withoutPrefix = ref.startsWith('remotes/') ? ref.slice('remotes/'.length) : ref;
  const slashIndex = withoutPrefix.indexOf('/');
  if (slashIndex === -1) return null;
  return withoutPrefix.slice(slashIndex + 1);
}

function normalizeRefForColor(ref: string, localBranches: Set<string>): string {
  if (localBranches.has(ref)) return ref;
  const shortName = getRemoteShortName(ref);
  if (shortName && localBranches.has(shortName)) {
    return shortName;
  }
  return ref;
}

function isLocalRef(ref: string, localBranches: Set<string>): boolean {
  return localBranches.has(ref);
}

function choosePreferredRef(refs: string[], localBranches: Set<string>): string | null {
  if (refs.length === 0) return null;
  const localRef = refs.find((ref) => isLocalRef(ref, localBranches));
  if (localRef) return localRef;
  return refs[0];
}

function shouldReplaceLaneRef(nextRef: string, currentRef: string | null, localBranches: Set<string>): boolean {
  if (!currentRef) return true;
  return isLocalRef(nextRef, localBranches) && !isLocalRef(currentRef, localBranches);
}

interface GenerateGraphOptions {
  localBranches?: string[];
}

export function generateGraphData(commits: Commit[], options: GenerateGraphOptions = {}): GraphNode[] {
  const nodes: GraphNode[] = [];
  const localBranches = new Set(options.localBranches ?? []);
  
  // Mapping of which commit hash is currently "expected" at the bottom of a lane.
  // lanes[i] = "hash123" means lane i is drawing a line downwards towards hash123.
  const lanes: (string | null)[] = []; 
  
  // Mapping of generic colors to lanes to keep consistency if possible
  const laneColors: (string | undefined)[] = [];
  const laneBranchRefs: (string | null)[] = [];
  
  function getNextFreeLane(): number {
    for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] === null) return i;
    }
    return lanes.length;
  }

  function getColor(lane: number): string {
      const laneRef = laneBranchRefs[lane];
      const preferredColor = laneRef ? getBranchGraphColor(laneRef) : (laneColors[lane] ?? getLaneFallbackColor(lane));
      laneColors[lane] = preferredColor;
      return preferredColor;
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
      while (lanes.length <= lane) {
        lanes.push(null);
        laneBranchRefs.push(null);
        laneColors.push(undefined);
      }

      const preferredRef = choosePreferredRef(parseBranchRefs(commit.refs), localBranches);
      if (preferredRef) {
        const normalizedRef = normalizeRefForColor(preferredRef, localBranches);
        if (shouldReplaceLaneRef(normalizedRef, laneBranchRefs[lane], localBranches)) {
          laneBranchRefs[lane] = normalizedRef;
        }
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
                  while (lanes.length <= newLane) {
                    lanes.push(null);
                    laneBranchRefs.push(null);
                    laneColors.push(undefined);
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

      if (lanes[lane] === null) {
        laneBranchRefs[lane] = null;
        laneColors[lane] = undefined;
      }
      
      nodes.push(node);
  });
  
  return nodes;
}
