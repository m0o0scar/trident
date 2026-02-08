'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, GitBranch, ArrowUp, Loader2 } from 'lucide-react';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Select Repository</DialogTitle>
           <div className="text-xs text-muted-foreground font-mono truncate pt-2">
            {currentPath || 'Loading...'}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden relative bg-background">
            {isLoading && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
                </div>
            )}
            
            <ScrollArea className="h-full">
                <div className="divide-y">
                    {data?.parent && (
                        <div 
                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer text-muted-foreground transition-colors"
                            onClick={() => handleNavigate(data.parent)}
                        >
                            <ArrowUp className="w-4 h-4" />
                            <span className="text-sm">..</span>
                        </div>
                    )}
                    
                    {data?.folders.map((item) => (
                        <div 
                            key={item.path}
                            className={cn(
                                "flex items-center justify-between px-4 py-3 hover:bg-muted/50 cursor-pointer group transition-colors",
                                item.name.startsWith('.') && "opacity-60"
                            )}
                            onClick={() => handleNavigate(item.path)}
                        >
                            <div className="flex items-center gap-3 truncate">
                                {item.isRepo ? <GitBranch className="w-4 h-4 text-primary" /> : <Folder className="w-4 h-4 text-muted-foreground" />}
                                <span className={cn("text-sm font-mono", item.isRepo && "font-medium")}>{item.name}</span>
                            </div>
                            
                            {item.isRepo && (
                                <Button 
                                    size="xs" 
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={(e) => { e.stopPropagation(); onSelect(item.path); onOpenChange(false); }}
                                >
                                    Select
                                </Button>
                            )}
                        </div>
                    ))}
                    
                    {data?.folders.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No folders found
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>

        <DialogFooter className="p-4 border-t flex items-center justify-between sm:justify-between bg-muted/5">
           <div className="text-xs text-muted-foreground">
               Click folder to navigate.
           </div>
           <Button variant="default" onClick={() => { onSelect(currentPath); onOpenChange(false); }}>
               Select Current Folder
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
