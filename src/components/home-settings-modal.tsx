'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderOpen, Loader2 } from 'lucide-react';
import { FileSystemBrowser } from './fs-browser';

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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [localDefaultFolder, setLocalDefaultFolder] = useState<string>('');

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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure your application preferences.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="defaultRootFolder">Default Root Folder</Label>
                <p className="text-xs text-muted-foreground">
                  The starting folder when browsing for new repositories. Leave empty to use your home folder.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="defaultRootFolder"
                    value={localDefaultFolder}
                    onChange={(e) => setLocalDefaultFolder(e.target.value)}
                    placeholder={settings?.resolvedDefaultFolder || 'User home folder'}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFolderBrowserOpen(true)}
                    title="Browse folders"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
                {localDefaultFolder && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={handleReset}
                  >
                    Reset to default (home folder)
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileSystemBrowser
        open={folderBrowserOpen}
        onOpenChange={setFolderBrowserOpen}
        onSelect={handleFolderSelect}
        initialPath={localDefaultFolder || settings?.resolvedDefaultFolder}
      />
    </>
  );
}
