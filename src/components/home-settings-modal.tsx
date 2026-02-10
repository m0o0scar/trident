'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { FileSystemBrowser } from './fs-browser';
import { ComputerDesktopIcon, FolderOpenIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';

interface Settings {
  defaultRootFolder: string | null;
  resolvedDefaultFolder: string;
}

interface HomeSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange?: (settings: Settings) => void;
}

export function HomeSettingsModal({ open, onOpenChange, onSettingsChange }: HomeSettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [localDefaultFolder, setLocalDefaultFolder] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setLocalDefaultFolder(data.defaultRootFolder || '');
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultRootFolder: localDefaultFolder.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        onSettingsChange?.(data);
        onOpenChange(false);
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFolderSelect = (path: string) => {
    setLocalDefaultFolder(path);
  };

  const handleReset = () => {
    setLocalDefaultFolder('');
  };

  if (!open) return null;

  return (
    <>
      <dialog className="modal modal-open">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Settings</h3>
          <p className="py-4 opacity-70">Configure your application preferences.</p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="loading loading-spinner loading-md"></span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Theme Selection */}
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text">Color Theme</span>
                </label>
                <div className="text-xs opacity-70 mb-2">
                  Choose your preferred color theme for the application.
                </div>
                <div className="flex gap-2">
                  <button
                    className={`btn flex-1 ${theme === 'system' ? 'btn-primary' : ''}`}
                    onClick={() => setTheme('system')}
                    disabled={!mounted}
                  >
                    <ComputerDesktopIcon className="h-5 w-5 mr-2" />
                    System
                  </button>
                  <button
                    className={`btn flex-1 ${theme === 'light' ? 'btn-primary' : ''}`}
                    onClick={() => setTheme('light')}
                    disabled={!mounted}
                  >
                    <SunIcon className="h-5 w-5 mr-2" />
                    Light
                  </button>
                  <button
                    className={`btn flex-1 ${theme === 'dark' ? 'btn-primary' : ''}`}
                    onClick={() => setTheme('dark')}
                    disabled={!mounted}
                  >
                    <MoonIcon className="h-5 w-5 mr-2" />
                    Dark
                  </button>
                </div>
              </div>

              {/* Default Root Folder */}
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text">Default Root Folder</span>
                </label>
                <div className="text-xs opacity-70 mb-2">
                  The starting folder when browsing for new repositories. Leave empty to use your home folder.
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={settings?.resolvedDefaultFolder || 'User home folder'}
                    className="input input-bordered w-full font-mono text-sm"
                    value={localDefaultFolder}
                    onChange={(e) => setLocalDefaultFolder(e.target.value)}
                  />
                  <button className="btn btn-square" onClick={() => setFolderBrowserOpen(true)} title="Browse folders">
                    <FolderOpenIcon className="h-5 w-5" />
                  </button>
                </div>
                {localDefaultFolder && (
                  <label className="label">
                    <span className="label-text-alt link link-hover text-primary" onClick={handleReset}>Reset to default (home folder)</span>
                  </label>
                )}
              </div>
            </div>
          )}

          <div className="modal-action">
             <button className="btn" onClick={() => onOpenChange(false)}>Close</button>
             <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || isLoading}>
               {isSaving && <span className="loading loading-spinner loading-xs"></span>}
               Save Folder Settings
             </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
            <button onClick={() => onOpenChange(false)}>close</button>
        </form>
      </dialog>

      <FileSystemBrowser
        open={folderBrowserOpen}
        onOpenChange={setFolderBrowserOpen}
        onSelect={handleFolderSelect}
        initialPath={localDefaultFolder || settings?.resolvedDefaultFolder}
      />
    </>
  );
}
