import { GitService } from '@/lib/git';
import { getRepositories } from '@/lib/store';
import { getCredentialById, getCredentialToken, findCredentialForRemote } from '@/lib/credentials';

export async function resolveCredentials(repoPath: string, git: GitService, remoteName?: string) {
  const repos = getRepositories();
  const repoConfig = repos.find(r => r.path === repoPath);

  // 1. Check for explicitly associated credential
  if (repoConfig?.credentialId) {
    const cred = await getCredentialById(repoConfig.credentialId);
    if (cred) {
      const token = await getCredentialToken(cred.id);
      if (token) {
        return { username: cred.username, token };
      }
    }
  }

  // 2. Fallback: try to find matching credential by URL
  if (remoteName) {
    const remoteUrl = await git.getRemoteUrl(remoteName);
    if (remoteUrl) {
       const result = await findCredentialForRemote(remoteUrl);
       if (result) {
         return { username: result.credential.username, token: result.token };
       }
    }
  }

  return undefined;
}

export function toImageSide(buffer: Buffer | null, mimeType: string) {
  if (!buffer) return null;
  return {
    mimeType,
    base64: buffer.toString('base64'),
  };
}
