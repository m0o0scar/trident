'use client';

import { useGitLog, useGitBranches, useGitAction } from '@/hooks/use-git';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    return <div className="flex items-center justify-center p-8 h-full"><Loader2 className="animate-spin" /></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <span className="text-lg">Error Loading History</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'An unknown error occurred'}</p>
            <Button onClick={() => refetch()} variant="outline" className="w-full">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!log) return <div className="flex items-center justify-center p-8 h-full">No history data available</div>;

  return (
    <div className="flex h-full gap-4">
      {/* Branch Sidebar */}
      <div className="w-64 flex flex-col border rounded-md bg-card">
        <div className="p-3 border-b font-medium text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Branches
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {branchData?.branches.map((branch) => (
              <ContextMenu key={branch}>
                <ContextMenuTrigger>
                  <div className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted",
                    branch === branchData.current && "bg-muted font-medium"
                  )}>
                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate flex-1">{branch}</span>
                    {branch === branchData.current && <Badge variant="secondary" className="text-[10px] h-5 px-1">Current</Badge>}
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
              This action cannot be undone and any uncommitted changes on that branch will be lost.
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
              Create a new branch from the current HEAD and switch to it.
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
      <div className="flex-1 flex flex-col space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Commit History</h1>
          <div className="text-xs text-muted-foreground">
            {log.all.length} commits {isFetching && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
          </div>
        </div>

        <div className="flex-1 overflow-hidden border rounded-md">
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
          <Card className="h-48 flex flex-col overflow-hidden p-0 gap-0">
            <CardHeader className="flex flex-row items-center py-3 px-4 border-b bg-card shrink-0 !pb-3">
              <CardTitle className="text-sm font-semibold leading-normal truncate">
                {log.all.find(c => c.hash === selectedHash)?.message}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4">
              <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {log.all.find(c => c.hash === selectedHash)?.body}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
