'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface FSItem {
  name: string;
  path: string;
  isRepo: boolean;
}

interface FSResponse {
  path: string;
  folders: FSItem[];
  parent: string;
}

interface FileSystemBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

export function FileSystemBrowser({ open, onOpenChange, onSelect, initialPath }: FileSystemBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [data, setData] = useState<FSResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const loadPath = async (path?: string) => {
    setIsLoading(true);
    try {
      const url = path ? `/api/fs?path=${encodeURIComponent(path)}` : '/api/fs';
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) {
        setData(json);
        setCurrentPath(json.path);
      } else {
          console.error(json.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && !hasInitialized) {
      loadPath(initialPath);
      setHasInitialized(true);
    }
    if (!open) {
      // Reset when dialog closes so it starts fresh next time
      setHasInitialized(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  const handleNavigate = (path: string) => {
      loadPath(path);
  }

  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box w-11/12 max-w-2xl h-[80vh] flex flex-col p-0 overflow-hidden bg-base-100">
        <div className="p-4 border-b border-base-300 flex justify-between items-center bg-base-200/50">
          <div className="overflow-hidden">
              <h3 className="font-bold text-lg">Select Repository</h3>
              <div className="text-xs opacity-70 font-mono truncate pt-1" title={currentPath}>
                {currentPath || 'Loading...'}
              </div>
          </div>
          <button className="btn btn-sm btn-circle btn-ghost" onClick={() => onOpenChange(false)}>✕</button>
        </div>

        <div className="flex-1 overflow-hidden relative bg-base-100">
            {isLoading && (
                <div className="absolute inset-0 bg-base-100/50 flex items-center justify-center z-10">
                    <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
            )}
            
            <div className="h-full overflow-y-auto">
                <div className="divide-y divide-base-200">
                    {data?.parent && (
                        <div 
                            className="flex items-center gap-3 px-4 py-3 hover:bg-base-200 cursor-pointer opacity-70 transition-colors"
                            onClick={() => handleNavigate(data.parent)}
                        >
                            <span className="text-lg">⬆️</span>
                            <span className="text-sm">..</span>
                        </div>
                    )}
                    
                    {data?.folders.map((item) => (
                        <div 
                            key={item.path}
                            className={cn(
                                "flex items-center justify-between px-4 py-3 hover:bg-base-200 cursor-pointer group transition-colors",
                                item.name.startsWith('.') && "opacity-60"
                            )}
                            onClick={() => handleNavigate(item.path)}
                        >
                            <div className="flex items-center gap-3 truncate">
                                <span className="text-lg">{item.isRepo ? '🌿' : '📁'}</span>
                                <span className={cn("text-sm font-mono", item.isRepo && "font-medium")}>{item.name}</span>
                            </div>
                            
                            {item.isRepo && (
                                <button
                                    className="btn btn-xs btn-outline"
                                    onClick={(e) => { e.stopPropagation(); onSelect(item.path); onOpenChange(false); }}
                                >
                                    Select
                                </button>
                            )}
                        </div>
                    ))}
                    
                    {data?.folders.length === 0 && (
                        <div className="p-8 text-center opacity-70 text-sm">
                            No folders found
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="p-4 border-t border-base-300 flex items-center justify-between bg-base-200/30">
           <div className="text-xs opacity-70">
               Click folder to navigate.
           </div>
           <button className="btn btn-primary btn-sm" onClick={() => { onSelect(currentPath); onOpenChange(false); }}>
               Select Current Folder
           </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={() => onOpenChange(false)}>close</button>
      </form>
    </dialog>
  );
}
