'use client';

import { useEffect } from 'react';

/**
 * Updates the document title with the repo name and page name.
 * @param repoPath - The full path to the repository (e.g., "C:\\Users\\user\\projects\\repo" or "/Users/user/projects/repo")
 * @param pageName - The name of the current page (e.g., "History", "Changes", "Stashes", "Settings")
 */
export function useWorkspaceTitle(repoPath: string | null, pageName: string) {
    useEffect(() => {
        // Handle both Windows (backslash) and Unix (forward slash) paths
        const repoName = repoPath ? repoPath.split(/[/\\]/).pop() : 'Workspace';
        document.title = `${repoName} | ${pageName}`;
    }, [repoPath, pageName]);
}
