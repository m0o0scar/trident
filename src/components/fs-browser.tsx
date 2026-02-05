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
}

export function FileSystemBrowser({ open, onOpenChange, onSelect }: FileSystemBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [data, setData] = useState<FSResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    if (open && !currentPath) {
      loadPath();
    }
  }, [open]);

  const handleNavigate = (path: string) => {
      loadPath(path);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Repository</DialogTitle>
           <div className="text-sm text-muted-foreground font-mono truncate bg-muted p-1 rounded">
            {currentPath || 'Loading...'}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden border rounded-md relative">
            {isLoading && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <Loader2 className="animate-spin w-8 h-8" />
                </div>
            )}
            
            <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                    {data?.parent && (
                        <div 
                            className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer text-muted-foreground"
                            onClick={() => handleNavigate(data.parent)}
                        >
                            <ArrowUp className="w-4 h-4" />
                            <span>..</span>
                        </div>
                    )}
                    
                    {data?.folders.map((item) => (
                        <div 
                            key={item.path}
                            className={cn(
                                "flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer group",
                                item.isRepo && "bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100/50 dark:hover:bg-blue-900/20",
                                item.name.startsWith('.') && "opacity-60"
                            )}
                            onClick={() => handleNavigate(item.path)}
                        >
                            <div className="flex items-center gap-2 truncate">
                                {item.isRepo ? <GitBranch className="w-4 h-4 text-blue-500" /> : <Folder className="w-4 h-4 text-yellow-500" />}
                                <span className="font-mono text-sm">{item.name}</span>
                            </div>
                            
                            {item.isRepo && (
                                <Button 
                                    size="xs" 
                                    variant="secondary" 
                                    onClick={(e) => { e.stopPropagation(); onSelect(item.path); onOpenChange(false); }}
                                >
                                    Select
                                </Button>
                            )}
                        </div>
                    ))}
                    
                    {data?.folders.length === 0 && (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            No folders found
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between">
           <div className="text-xs text-muted-foreground">
               Click folder to navigate. Click Select on valid repos.
           </div>
           <Button variant="default" onClick={() => { onSelect(currentPath); onOpenChange(false); }}>
               Select Current Folder
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
