
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Repository, AppSettings } from './types';

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

function normalizeDisplayName(displayName?: string | null): string | null | undefined {
  if (displayName === undefined) return undefined;
  const normalized = displayName.trim();
  return normalized.length > 0 ? normalized : null;
}

export function addRepository(repoPath: string, name?: string, displayName?: string | null): Repository {
  const repos = getRepositories();
  // Check if exists
  if (repos.find(r => r.path === repoPath)) {
    throw new Error('Repository already exists');
  }

  const normalizedDisplayName = normalizeDisplayName(displayName);
  const newRepo: Repository = {
    path: repoPath,
    name: name || path.basename(repoPath),
    ...(normalizedDisplayName ? { displayName: normalizedDisplayName } : {}),
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

  const normalizedUpdates: Partial<Repository> = { ...updates };
  if ('displayName' in normalizedUpdates) {
    normalizedUpdates.displayName = normalizeDisplayName(normalizedUpdates.displayName);
  }

  const updatedRepo = { ...repos[repoIndex], ...normalizedUpdates };
  repos[repoIndex] = updatedRepo;
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(repos, null, 2));
  return updatedRepo;
}

export function removeRepository(repoPath: string): void {
  let repos = getRepositories();
  repos = repos.filter(r => r.path !== repoPath);
  fs.writeFileSync(DATA_FILE, JSON.stringify(repos, null, 2));
}

// Settings management
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export function getSettings(): AppSettings {
  const defaults: AppSettings = {
    defaultRootFolder: null, // null means use user's home directory
    sidebarCollapsed: false,
  };

  if (!fs.existsSync(SETTINGS_FILE)) {
    return defaults;
  }

  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const saved = JSON.parse(data);
    return { ...defaults, ...saved };
  } catch (error) {
    console.error('Failed to parse settings.json', error);
    return defaults;
  }
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...updates };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

export function getDefaultRootFolder(): string {
  const settings = getSettings();
  
  // If a default folder is set, check if it still exists
  if (settings.defaultRootFolder) {
    try {
      if (fs.existsSync(settings.defaultRootFolder) && fs.statSync(settings.defaultRootFolder).isDirectory()) {
        return settings.defaultRootFolder;
      }
    } catch {
      // Folder doesn't exist or can't be accessed, fall back to home
    }
  }
  
  // Fall back to user's home directory
  return os.homedir();
}
