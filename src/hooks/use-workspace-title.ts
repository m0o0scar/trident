'use client';

import { useEffect } from 'react';

/**
 * Updates the document title with the repo name extracted from the path.
 * @param repoPath - The full path to the repository (e.g., "/Users/tangqh/Downloads/projects/git-web")
 */
export function useWorkspaceTitle(repoPath: string | null) {
    useEffect(() => {
        const repoName = repoPath ? repoPath.split('/').pop() : 'Workspace';
        document.title = `${repoName} - Trident`;
    }, [repoPath]);
}
