'use client';

import { useGitAction, useGitConflictState, useGitStatus } from '@/hooks/use-git';
import { useState, useCallback } from 'react';
import { DiffView } from './diff-view';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';

function operationLabel(operation: 'merge' | 'rebase' | null): string {
  if (operation === 'merge') return 'Merge';
  if (operation === 'rebase') return 'Rebase';
  return 'Conflict';
}

export function ConflictResolverView({ repoPath }: { repoPath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: status, isLoading: isStatusLoading, isError: isStatusError, error: statusError, refetch: refetchStatus } = useGitStatus(repoPath);
  const {
    data: conflictState,
    isLoading: isConflictStateLoading,
    isError: isConflictStateError,
    error: conflictStateError,
    refetch: refetchConflictState,
  } = useGitConflictState(repoPath);
  const { mutateAsync: runGitAction, isPending: isActionPending } = useGitAction();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const conflictedFiles = status?.conflicted ?? [];
  const unresolvedSet = new Set(conflictedFiles);
  const resolvedFiles = (status?.files ?? [])
    .filter((file) => !unresolvedSet.has(file.path) && file.index === ' ' && file.working_dir !== ' ')
    .map((file) => file.path);
  const effectiveSelectedFile = selectedFile && conflictedFiles.includes(selectedFile)
    ? selectedFile
    : conflictedFiles[0] ?? null;

  const operation = conflictState?.operation ?? null;

  const buildWorkspaceHref = useCallback((subPath: string = '') => {
    const params = new URLSearchParams(searchParams.toString());
    const query = params.toString();
    return query ? `/workspace${subPath}?${query}` : `/workspace${subPath}`;
  }, [searchParams]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refetchStatus(), refetchConflictState()]);
  }, [refetchConflictState, refetchStatus]);

  const handleStageResolved = async (filePath: string) => {
    await runGitAction({
      repoPath,
      action: 'stage',
      data: { files: [filePath] },
    });

    await refreshAll();
  };

  const handleAbort = async () => {
    const action = operation === 'rebase' ? 'abort-rebase' : operation === 'merge' ? 'abort-merge' : null;
    if (!action) return;

    await runGitAction({
      repoPath,
      action,
    });

    toast({
      type: 'info',
      title: `${operationLabel(operation)} Aborted`,
      description: `The ${operationLabel(operation).toLowerCase()} operation was aborted.`,
    });

    router.push(buildWorkspaceHref('/changes'));
  };

  const handleContinue = async () => {
    const action = operation === 'rebase' ? 'continue-rebase' : operation === 'merge' ? 'continue-merge' : null;
    if (!action) return;

    await runGitAction({
      repoPath,
      action,
    });

    toast({
      type: 'success',
      title: `${operationLabel(operation)} Completed`,
      description: `${operationLabel(operation)} continued successfully.`,
    });

    router.push(buildWorkspaceHref());
  };

  if (isStatusLoading || isConflictStateLoading) {
    return <div className="flex items-center justify-center h-64"><span className="loading loading-spinner text-base-content/50"></span></div>;
  }

  if (isStatusError || isConflictStateError) {
    return (
      <div className="flex items-center justify-center h-64 flex-col gap-4">
        <p className="text-error font-bold">Error Loading Conflicts</p>
        <p className="text-sm opacity-70">{(statusError as Error)?.message || (conflictStateError as Error)?.message || 'An unknown error occurred'}</p>
        <button onClick={() => refreshAll()} className="btn btn-outline btn-sm" disabled={isActionPending}>
          <i className="iconoir-refresh-circle text-[16px] mr-1" aria-hidden="true" />
          Try Again
        </button>
      </div>
    );
  }

  const isOperationInProgress = Boolean(operation);
  const hasConflicts = conflictedFiles.length > 0;
  const canContinue = Boolean(conflictState?.canContinue) && isOperationInProgress;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 border-r border-base-300 flex flex-col bg-base-200/30">
        <div className="h-[57px] px-4 border-b border-base-300 flex items-center justify-between bg-base-100">
          <h1 className="font-bold text-lg">Conflicts</h1>
          <button className="btn btn-ghost btn-sm btn-square" onClick={() => refreshAll()} disabled={isActionPending} title="Refresh">
            <i className="iconoir-refresh-circle text-[16px]" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 border-b border-base-300 space-y-2">
          <div className="text-xs opacity-70">Operation</div>
          <div className="flex items-center justify-between">
            <span className={cn('badge', isOperationInProgress ? 'badge-warning' : 'badge-ghost')}>
              {isOperationInProgress ? operationLabel(operation) : 'None'}
            </span>
            <span className={cn('badge', hasConflicts ? 'badge-error' : 'badge-success')}>
              {hasConflicts ? `${conflictedFiles.length} unresolved` : 'No unresolved'}
            </span>
          </div>
          {!isOperationInProgress && hasConflicts && (
            <p className="text-xs opacity-70">
              Conflicts exist, but no active merge/rebase state was detected. Resolve files and commit manually.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="px-2 py-2 text-xs font-bold uppercase tracking-wider opacity-70">Unresolved Files</div>
          <div className="space-y-0.5">
            {conflictedFiles.length === 0 && (
              <p className="px-2 py-2 text-xs opacity-50 italic">No unresolved conflicts.</p>
            )}
            {conflictedFiles.map((file) => (
              <button
                key={file}
                className={cn(
                  'w-full text-left flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-base-300 transition-colors',
                  effectiveSelectedFile === file && 'bg-base-300 text-primary font-medium'
                )}
                onClick={() => setSelectedFile(file)}
                title={file}
              >
                <i className="iconoir-warning-triangle text-[14px] text-error shrink-0" aria-hidden="true" />
                <span className="truncate font-mono text-xs">{file}</span>
              </button>
            ))}
          </div>

          {resolvedFiles.length > 0 && (
            <>
              <div className="h-px bg-base-300 mx-2 my-3" />
              <div className="px-2 py-2 text-xs font-bold uppercase tracking-wider opacity-70">Ready to Stage</div>
              <div className="space-y-1">
                {resolvedFiles.map((file) => (
                  <div key={file} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-base-100 border border-base-300">
                    <span className="truncate font-mono text-xs flex-1" title={file}>{file}</span>
                    <button
                      className="btn btn-xs btn-success"
                      onClick={() => handleStageResolved(file)}
                      disabled={isActionPending}
                      title="Stage as resolved"
                    >
                      Stage
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-base-300 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleContinue}
              disabled={!canContinue || isActionPending}
            >
              Continue
            </button>
            <button
              className="btn btn-error btn-outline btn-sm"
              onClick={handleAbort}
              disabled={!isOperationInProgress || isActionPending}
            >
              Abort
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => router.push(buildWorkspaceHref('/changes'))}>Changes</button>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push(buildWorkspaceHref())}>History</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-base-100 overflow-hidden">
        {effectiveSelectedFile ? (
          <DiffView repoPath={repoPath} filePath={effectiveSelectedFile} />
        ) : (
          <div className="flex-1 flex items-center justify-center opacity-60">
            <div className="text-center">
              <div className="p-8 rounded-full bg-base-200 mb-4 text-4xl mx-auto w-fit">
                <i className="iconoir-warning-triangle text-[32px]" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold">Select a conflicted file to inspect diff</p>
              <p className="text-xs opacity-70 mt-2">Resolve in your editor, then stage and continue.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
