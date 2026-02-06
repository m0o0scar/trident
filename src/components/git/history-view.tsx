'use client';

import { useGitLog, useGitBranches, useGitAction } from '@/hooks/use-git';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, GitBranch, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { GitGraph } from './git-graph';
import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function HistoryView({ repoPath }: { repoPath: string }) {
  const [limit, setLimit] = useState(100);
  const { data: log, isLoading, isError, error, refetch, isFetching } = useGitLog(repoPath, limit);
  const { data: branchData } = useGitBranches(repoPath);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const { mutateAsync: runGitAction } = useGitAction();
  const [iscreateBranchOpen, setIsCreateBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteBranch = (branch: string) => {
    setBranchToDelete(branch);
    setIsDeleteOpen(true);
  }

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeleting(true);
    try {
      await runGitAction({
        repoPath,
        action: 'delete-branch',
        data: { branch: branchToDelete }
      });
      setIsDeleteOpen(false);
      setBranchToDelete(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
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
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 h-full flex-col gap-4">
        <p className="text-destructive font-medium">Error Loading History</p>
        <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'An unknown error occurred'}</p>
        <Button onClick={() => refetch()} variant="outline">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Try Again
        </Button>
      </div>
    );
  }

  if (!log) return <div className="flex items-center justify-center p-8 h-full text-muted-foreground">No history data available</div>;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Branch Sidebar */}
      <div className="w-64 flex flex-col border-r bg-muted/10">
        <div className="p-4 border-b flex items-center justify-between bg-background h-[57px]">
          <div className="flex items-center gap-2 font-semibold">
             <GitBranch className="h-4 w-4" />
             Branches
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreateBranchOpen(true)} title="Create Branch">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-2 space-y-0.5">
            {branchData?.branches.map((branch) => (
              <ContextMenu key={branch}>
                <ContextMenuTrigger>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                    branch === branchData.current && "bg-muted font-medium text-primary"
                  )}
                  >
                    <GitBranch className={cn("h-3 w-3 text-muted-foreground", branch === branchData.current && "text-primary")} />
                    <span className="truncate flex-1" title={branch}>{branch}</span>
                    {branch === branchData.current && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    disabled={branch === branchData.current}
                    onSelect={() => handleCheckout(branch)}
                  >
                    Checkout
                  </ContextMenuItem>

                  <ContextMenuItem onSelect={() => setIsCreateBranchOpen(true)}>
                    Create Branch...
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={branch === branchData.current}
                    className="text-destructive focus:text-destructive"
                    onSelect={() => confirmDeleteBranch(branch)}
                  >
                    Delete Branch...
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        </ScrollArea>
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the branch <span className="font-semibold text-foreground">{branchToDelete}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteBranch(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={iscreateBranchOpen} onOpenChange={setIsCreateBranchOpen}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from the current HEAD.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              placeholder="Branch name"
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateBranchOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button onClick={handleCreateBranch} disabled={!newBranchName || isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & Checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <div className="h-[57px] flex items-center justify-between px-6 border-b shrink-0">
          <h1 className="font-semibold text-lg">History</h1>
          <div className="text-xs text-muted-foreground font-mono">
            {log.all.length} commits {isFetching && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <GitGraph
            commits={log.all}
            selectedHash={selectedHash || undefined}
            onSelectCommit={setSelectedHash}
            onEndReached={() => {
              if (!isFetching && log.all.length >= limit) {
                setLimit(l => l + 50);
              }
            }}
          />
        </div>

        {selectedHash && (
          <div className="h-48 flex flex-col overflow-hidden border-t bg-muted/10">
            <div className="flex flex-row items-center py-2 px-4 border-b bg-background shrink-0 justify-between">
              <span className="text-sm font-semibold truncate flex-1 mr-4">
                {log.all.find(c => c.hash === selectedHash)?.message}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                  {selectedHash.substring(0, 7)}
              </span>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-background">
              <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {log.all.find(c => c.hash === selectedHash)?.body}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
