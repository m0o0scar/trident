'use client';

import { DiffImage } from '@/lib/types';
import { useEffect, useMemo, useState } from 'react';

interface ImageDiffViewProps {
  filePath: string;
  imageDiff?: DiffImage | null;
}

function ImagePane({
  title,
  filePath,
  mimeType,
  base64,
}: {
  title: string;
  filePath: string;
  mimeType?: string;
  base64?: string;
}) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const formattedSize = useMemo(() => {
    if (!base64) return null;

    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [base64]);

  useEffect(() => {
    if (!mimeType || !base64) {
      setDimensions(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setDimensions(null);
      }
    };
    image.src = `data:${mimeType};base64,${base64}`;

    return () => {
      cancelled = true;
    };
  }, [mimeType, base64]);

  const metadata =
    dimensions && formattedSize
      ? `${dimensions.width} x ${dimensions.height} px, ${formattedSize}`
      : formattedSize
        ? `-, ${formattedSize}`
        : null;

  return (
    <section className="border border-base-300 rounded-lg bg-base-200/30 overflow-hidden h-full min-h-0 flex flex-col">
      <header className="px-3 py-2 border-b border-base-300 text-[10px] uppercase tracking-wider font-bold opacity-70">
        {metadata ? `${title} (${metadata})` : title}
      </header>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        {mimeType && base64 ? (
          <img
            src={`data:${mimeType};base64,${base64}`}
            alt={`${title} image for ${filePath}`}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <span className="text-sm opacity-50">No image</span>
        )}
      </div>
    </section>
  );
}

export function ImageDiffView({ filePath, imageDiff }: ImageDiffViewProps) {
  return (
    <div className="h-full p-4 box-border">
      <div className="min-w-[720px] h-full min-h-0 grid grid-cols-2 gap-4">
        <ImagePane
          title="Old"
          filePath={filePath}
          mimeType={imageDiff?.left?.mimeType}
          base64={imageDiff?.left?.base64}
        />
        <ImagePane
          title="New"
          filePath={filePath}
          mimeType={imageDiff?.right?.mimeType}
          base64={imageDiff?.right?.base64}
        />
      </div>
    </div>
  );
}
