
import fs from 'fs';
import path from 'path';
import { Repository } from './types';

// Store the list of known repositories in a local JSON file.
// In a real desktop app, this might be in userData directory.
const DATA_FILE = path.join(process.cwd(), 'data', 'repos.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
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
