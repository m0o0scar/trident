'use client';

import { useState } from 'react';
import { useCredentials, useCreateCredential, useUpdateCredential, useDeleteCredential } from '@/hooks/use-credentials';
import type { Credential, GitLabCredential } from '@/hooks/use-credentials';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, Github, GitlabIcon, Loader2, User, Calendar, Server, Key, Eye, EyeOff } from 'lucide-react';

type CredentialFormType = 'github' | 'gitlab' | null;

export default function CredentialsPage() {
  const { data: credentials, isLoading, error } = useCredentials();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const deleteCredential = useDeleteCredential();

  const [formType, setFormType] = useState<CredentialFormType>(null);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [deletingCredential, setDeletingCredential] = useState<Credential | null>(null);

  // Form state
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setFormType(null);
    setEditingCredential(null);
    setToken('');
    setServerUrl('');
    setShowToken(false);
    setFormError(null);
  };

  const handleOpenCreate = (type: CredentialFormType) => {
    resetForm();
    setFormType(type);
  };

  const handleOpenEdit = (credential: Credential) => {
    setEditingCredential(credential);
    setFormType(credential.type);
    setToken('');
    if (credential.type === 'gitlab') {
      setServerUrl(credential.serverUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      if (editingCredential) {
        await updateCredential.mutateAsync({ id: editingCredential.id, token });
      } else if (formType === 'github') {
        await createCredential.mutateAsync({ type: 'github', token });
      } else if (formType === 'gitlab') {
        await createCredential.mutateAsync({ type: 'gitlab', serverUrl, token });
      }
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deletingCredential) return;
    try {
      await deleteCredential.mutateAsync(deletingCredential.id);
      setDeletingCredential(null);
    } catch (err) {
      console.error('Failed to delete credential:', err);
    }
  };

  const hasGitHubCredential = credentials?.some((c) => c.type === 'github');
  const isSubmitting = createCredential.isPending || updateCredential.isPending;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl py-12 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Credentials</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your remote repository credentials
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Add Credential Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card
            className={`cursor-pointer transition-colors hover:border-primary/50 ${hasGitHubCredential ? 'opacity-50' : ''}`}
            onClick={() => !hasGitHubCredential && handleOpenCreate('github')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Github className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">GitHub</CardTitle>
                  <CardDescription className="text-xs">
                    {hasGitHubCredential ? 'Already configured' : 'Personal Access Token'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            {!hasGitHubCredential && (
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add GitHub
                </Button>
              </CardContent>
            )}
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-primary/50"
            onClick={() => handleOpenCreate('gitlab')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <GitlabIcon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">GitLab</CardTitle>
                  <CardDescription className="text-xs">Server URL + Personal Access Token</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Add GitLab Server
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Credentials List */}
        <div className="border rounded-lg overflow-hidden bg-background">
          <div className="px-6 py-3 bg-muted/40 border-b">
            <h2 className="text-sm font-medium">Saved Credentials</h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              <p className="mt-2 text-sm">Loading credentials...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-destructive">
              <p>Failed to load credentials</p>
            </div>
          ) : credentials?.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No credentials saved yet.</p>
              <p className="text-xs mt-1">Add your first credential using the cards above.</p>
            </div>
          ) : (
            <div className="divide-y">
              {credentials?.map((credential) => (
                <CredentialItem
                  key={credential.id}
                  credential={credential}
                  onEdit={() => handleOpenEdit(credential)}
                  onDelete={() => setDeletingCredential(credential)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formType !== null} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {formType === 'github' ? (
                <>
                  <Github className="h-5 w-5" />
                  {editingCredential ? 'Update GitHub Credential' : 'Add GitHub Credential'}
                </>
              ) : (
                <>
                  <GitlabIcon className="h-5 w-5" />
                  {editingCredential ? 'Update GitLab Credential' : 'Add GitLab Credential'}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingCredential
                ? 'Enter a new personal access token to update this credential.'
                : formType === 'github'
                ? 'Enter your GitHub personal access token. This will be stored securely in your system keychain.'
                : 'Enter your GitLab server URL and personal access token.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {formType === 'gitlab' && !editingCredential && (
                <div className="space-y-2">
                  <Label htmlFor="serverUrl">Server URL</Label>
                  <Input
                    id="serverUrl"
                    type="url"
                    placeholder="https://gitlab.example.com"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the full URL of your GitLab server
                  </p>
                </div>
              )}

              {formType === 'gitlab' && editingCredential && (
                <div className="space-y-2">
                  <Label>Server URL</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded text-sm font-mono">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    {(editingCredential as GitLabCredential).serverUrl}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="token">Personal Access Token</Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? 'text' : 'password'}
                    placeholder={editingCredential ? 'Enter new token' : 'ghp_xxxxxxxxxxxx or glpat-xxxxx'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formType === 'github'
                    ? 'Token needs repo scope for repository access'
                    : 'Token needs api scope for GitLab access'}
                </p>
              </div>

              {formError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{formError}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingCredential ? 'Update' : 'Verify & Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingCredential !== null} onOpenChange={(open) => !open && setDeletingCredential(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deletingCredential?.type === 'github' ? 'GitHub' : 'GitLab'}{' '}
              credential for <strong>{deletingCredential?.username}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCredential.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function CredentialItem({
  credential,
  onEdit,
  onDelete,
}: {
  credential: Credential;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isGitLab = credential.type === 'gitlab';

  return (
    <div className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className="p-2 bg-muted rounded-lg">
          {isGitLab ? <GitlabIcon className="h-5 w-5" /> : <Github className="h-5 w-5" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{isGitLab ? 'GitLab' : 'GitHub'}</span>
            {isGitLab && (
              <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                {(credential as GitLabCredential).serverUrl.replace(/^https?:\/\//, '')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {credential.username}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(credential.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
