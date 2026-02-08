
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Repository } from './types';

// Get cross-platform app data directory
function getAppDataDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    // Windows: %APPDATA%\trident
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'trident');
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/trident
    return path.join(homeDir, 'Library', 'Application Support', 'trident');
  } else {
    // Linux/others: ~/.config/trident
    return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), 'trident');
  }
}

// Store the list of known repositories in a shared app data directory.
// This allows all instances of the app to share the same repository list.
const DATA_DIR = getAppDataDir();
const DATA_FILE = path.join(DATA_DIR, 'repos.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function getRepositories(): Repository[] {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse repos.json', error);
    return [];
  }
}

export function addRepository(repoPath: string, name?: string): Repository {
  const repos = getRepositories();
  // Check if exists
  if (repos.find(r => r.path === repoPath)) {
    throw new Error('Repository already exists');
  }

  const newRepo: Repository = {
    path: repoPath,
    name: name || path.basename(repoPath),
  };

  repos.push(newRepo);
  fs.writeFileSync(DATA_FILE, JSON.stringify(repos, null, 2));
  return newRepo;
}

export function updateRepository(repoPath: string, updates: Partial<Repository>): Repository {
  const repos = getRepositories();
  const repoIndex = repos.findIndex(r => r.path === repoPath);
  
  if (repoIndex === -1) {
    throw new Error('Repository not found');
  }

  const updatedRepo = { ...repos[repoIndex], ...updates };
  repos[repoIndex] = updatedRepo;
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(repos, null, 2));
  return updatedRepo;
}

export function removeRepository(repoPath: string): void {
  let repos = getRepositories();
  repos = repos.filter(r => r.path !== repoPath);
  fs.writeFileSync(DATA_FILE, JSON.stringify(repos, null, 2));
}
