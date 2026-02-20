import { ContextMenuItem } from '@/components/context-menu';

export type BranchOperation = { sourceBranch: string; targetBranch: string };

export interface BranchMenuCallbacks {
  onCheckout: (branch: string) => void;
  onCheckoutToLocal: (remoteBranch: string) => void;
  onCreateBranch: (sourceBranch: string) => void;
  onDeleteBranch: (branch: string) => void;
  onDeleteBranches: (branches: string[]) => void;
  onRenameBranch: (branch: string) => void;
  onRenameRemoteBranch: (branch: string) => void;
  onRebase: (operation: BranchOperation) => void;
  onMerge: (operation: BranchOperation) => void;
  onPushToRemote: (branch: string) => void;
  onPullFromRemote: (branch: string) => void;
}

export interface BranchMenuOptions {
  branchRef: string;
  branchLeafName: string;
  currentBranch?: string;
  isRemote: boolean;
  selectedBranchRefs?: string[];
}

export function buildBranchContextMenuItems(
  options: BranchMenuOptions,
  callbacks: BranchMenuCallbacks
): ContextMenuItem[] {
  const { branchRef, branchLeafName, currentBranch, isRemote, selectedBranchRefs } = options;
  const isCurrent = !isRemote && branchRef === currentBranch;
  const selectedRefs = selectedBranchRefs && selectedBranchRefs.length > 0 ? selectedBranchRefs : [branchRef];
  const hasMultiSelection = selectedRefs.length > 1;
  const menuItems: ContextMenuItem[] = [];

  if (!isCurrent && !isRemote) menuItems.push({ label: 'Checkout', onClick: () => callbacks.onCheckout(branchRef) });
  if (isRemote) menuItems.push({ label: 'Checkout to local', onClick: () => callbacks.onCheckoutToLocal(branchRef) });
  menuItems.push({ label: 'Create Branch', onClick: () => callbacks.onCreateBranch(branchRef) });
  if (!isRemote) menuItems.push({ label: 'Rename Branch', onClick: () => callbacks.onRenameBranch(branchRef) });
  if (isRemote) menuItems.push({ label: 'Rename branch', onClick: () => callbacks.onRenameRemoteBranch(branchRef) });
  if (!isRemote) menuItems.push({ label: 'Push to Remote', onClick: () => callbacks.onPushToRemote(branchRef) });
  if (!isRemote) menuItems.push({ label: 'Pull from Remote', onClick: () => callbacks.onPullFromRemote(branchRef) });
  if (!isCurrent && currentBranch) {
    menuItems.push({
      label: `Rebase ${currentBranch} onto ${branchLeafName}`,
      labelNode: <>Rebase <span className="font-bold">{currentBranch}</span> onto {branchLeafName}</>,
      onClick: () => callbacks.onRebase({ sourceBranch: currentBranch, targetBranch: branchRef }),
    });
    menuItems.push({
      label: `Rebase ${branchLeafName} onto ${currentBranch}`,
      labelNode: <>Rebase {branchLeafName} onto <span className="font-bold">{currentBranch}</span></>,
      onClick: () => callbacks.onRebase({ sourceBranch: branchRef, targetBranch: currentBranch }),
    });
    menuItems.push({
      label: `Merge ${currentBranch} into ${branchLeafName}`,
      labelNode: <>Merge <span className="font-bold">{currentBranch}</span> into {branchLeafName}</>,
      onClick: () => callbacks.onMerge({ sourceBranch: currentBranch, targetBranch: branchRef }),
    });
    menuItems.push({
      label: `Merge ${branchLeafName} into ${currentBranch}`,
      labelNode: <>Merge {branchLeafName} into <span className="font-bold">{currentBranch}</span></>,
      onClick: () => callbacks.onMerge({ sourceBranch: branchRef, targetBranch: currentBranch }),
    });
  }
  if (!isCurrent) {
    if (hasMultiSelection) {
      menuItems.push({
        label: `Delete Selected Branches (${selectedRefs.length})`,
        onClick: () => callbacks.onDeleteBranches(selectedRefs),
        danger: true,
      });
    } else {
      menuItems.push({
        label: 'Delete Branch',
        onClick: () => callbacks.onDeleteBranch(branchRef),
        danger: true,
      });
    }
  }

  return menuItems;
}
