'use client';

import { useState } from 'react';
import { useCredentials, useCreateCredential, useUpdateCredential, useDeleteCredential } from '@/hooks/use-credentials';
import type { Credential, GitLabCredential } from '@/hooks/use-credentials';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';

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

  const isSubmitting = createCredential.isPending || updateCredential.isPending;

  return (
    <main className="min-h-screen bg-base-100">
      <div className="container mx-auto max-w-4xl py-12 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="btn btn-ghost btn-square">
              ⬅️
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Credentials</h1>
              <p className="text-sm opacity-70 mt-1">
                Manage your remote repository credentials
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Add Credential Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div
            className="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow cursor-pointer border border-base-200"
            onClick={() => handleOpenCreate('github')}
          >
            <div className="card-body p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-base-200 rounded-lg text-2xl">
                  🐙
                </div>
                <div>
                  <h3 className="card-title text-base">GitHub</h3>
                  <p className="text-xs opacity-70">
                    Personal Access Token
                  </p>
                </div>
              </div>
              <button className="btn btn-outline btn-sm w-full gap-2">
                ➕ Add GitHub
              </button>
            </div>
          </div>

          <div
            className="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow cursor-pointer border border-base-200"
            onClick={() => handleOpenCreate('gitlab')}
          >
            <div className="card-body p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-base-200 rounded-lg text-2xl">
                  🦊
                </div>
                <div>
                  <h3 className="card-title text-base">GitLab</h3>
                  <p className="text-xs opacity-70">Server URL + Personal Access Token</p>
                </div>
              </div>
              <button className="btn btn-outline btn-sm w-full gap-2">
                ➕ Add GitLab Server
              </button>
            </div>
          </div>
        </div>

        {/* Credentials List */}
        <div className="border border-base-200 rounded-lg overflow-hidden bg-base-100">
          <div className="px-6 py-3 bg-base-200/50 border-b border-base-200">
            <h2 className="text-sm font-bold opacity-70">Saved Credentials</h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center opacity-70">
              <span className="loading loading-spinner"></span>
              <p className="mt-2 text-sm">Loading credentials...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-error">
              <p>Failed to load credentials</p>
            </div>
          ) : credentials?.length === 0 ? (
            <div className="p-12 text-center opacity-50">
              <span className="text-4xl">🔑</span>
              <p className="font-bold mt-2">No credentials saved yet.</p>
              <p className="text-xs mt-1">Add your first credential using the cards above.</p>
            </div>
          ) : (
            <div className="divide-y divide-base-200">
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
      {formType !== null && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    {formType === 'github' ? '🐙 GitHub Credential' : '🦊 GitLab Credential'}
                </h3>
                <p className="py-4 text-sm opacity-70">
                    {editingCredential
                        ? 'Enter a new personal access token to update this credential.'
                        : formType === 'github'
                        ? 'Enter your GitHub personal access token. This will be stored securely in your system keychain.'
                        : 'Enter your GitLab server URL and personal access token.'}
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {formType === 'gitlab' && !editingCredential && (
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text">Server URL</span></label>
                            <input
                                type="url"
                                placeholder="https://gitlab.example.com"
                                value={serverUrl}
                                onChange={(e) => setServerUrl(e.target.value)}
                                required
                                className="input input-bordered w-full"
                            />
                            <label className="label"><span className="label-text-alt opacity-70">Enter the full URL of your GitLab server</span></label>
                        </div>
                    )}

                    {formType === 'gitlab' && editingCredential && (
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text">Server URL</span></label>
                            <div className="p-3 bg-base-200 rounded-lg text-sm font-mono flex items-center gap-2">
                                🖥️ {(editingCredential as GitLabCredential).serverUrl}
                            </div>
                        </div>
                    )}

                    <div className="form-control w-full">
                        <label className="label"><span className="label-text">Personal Access Token</span></label>
                        <div className="relative">
                            <input
                                type={showToken ? 'text' : 'password'}
                                placeholder={editingCredential ? 'Enter new token' : 'ghp_xxxxxxxxxxxx or glpat-xxxxx'}
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                className="input input-bordered w-full pr-10"
                                required
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-2 btn btn-ghost btn-xs btn-square"
                                onClick={() => setShowToken(!showToken)}
                            >
                                {showToken ? '🙈' : '👁️'}
                            </button>
                        </div>
                        <label className="label">
                            <span className="label-text-alt opacity-70">
                                {formType === 'github' ? (
                                    <>
                                    Token needs repo scope.{' '}
                                    <a
                                        href="https://github.com/settings/tokens/new?description=Trident&scopes=repo,user,notifications,workflow"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="link link-primary"
                                    >
                                        Create new token
                                    </a>
                                    </>
                                ) : (
                                    'Token needs api scope for GitLab access'
                                )}
                            </span>
                        </label>
                    </div>

                    {formError && (
                        <div className="alert alert-error text-sm">
                            <span>{formError}</span>
                        </div>
                    )}

                    <div className="modal-action">
                        <button type="button" className="btn" onClick={resetForm} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                            {isSubmitting && <span className="loading loading-spinner loading-xs"></span>}
                            {editingCredential ? 'Update' : 'Verify & Save'}
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={resetForm}>close</button>
            </form>
        </dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingCredential !== null && (
        <dialog className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Delete Credential</h3>
                <p className="py-4">
                    Are you sure you want to delete this {deletingCredential?.type === 'github' ? 'GitHub' : 'GitLab'}{' '}
                    credential for <strong>{deletingCredential?.username}</strong>? This action cannot be undone.
                </p>
                <div className="modal-action">
                    <button className="btn" onClick={() => setDeletingCredential(null)}>Cancel</button>
                    <button className="btn btn-error" onClick={handleDelete} disabled={deleteCredential.isPending}>
                        {deleteCredential.isPending && <span className="loading loading-spinner loading-xs"></span>}
                        Delete
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={() => setDeletingCredential(null)}>close</button>
            </form>
        </dialog>
      )}
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
    <div className="px-6 py-4 flex items-center justify-between hover:bg-base-200/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className="p-2 bg-base-200 rounded-lg text-xl">
          {isGitLab ? '🦊' : '🐙'}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{isGitLab ? 'GitLab' : 'GitHub'}</span>
            {isGitLab && (
              <span className="text-xs opacity-70 font-mono bg-base-200 px-1.5 py-0.5 rounded">
                {(credential as GitLabCredential).serverUrl.replace(/^https?:\/\//, '')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs opacity-70 mt-1">
            <span className="flex items-center gap-1">
              👤 {credential.username}
            </span>
            <span className="flex items-center gap-1">
              📅 {new Date(credential.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm btn-square" onClick={onEdit} title="Edit">
          ✏️
        </button>
        <button
          className="btn btn-ghost btn-sm btn-square text-error hover:bg-error/10"
          onClick={onDelete}
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
