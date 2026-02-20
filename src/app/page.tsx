
import Image from 'next/image';
import { RepoList } from '@/components/repo-list';

export default function Home() {
  return (
    <>
      <a
        href="https://github.com/m0o0scar/trident"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open Viba GitHub repository"
        className="fixed right-0 top-0 z-50 h-20 w-20 cursor-pointer border-b border-l border-gray-400 bg-gray-300/95 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-500/95"
        style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      >
        <span className="absolute left-[67%] top-[33%] -translate-x-1/2 -translate-y-1/2">
          <Image src="/github.png" alt="GitHub" width={22} height={22} priority className="rotate-45" />
        </span>
      </a>
      <main className="min-h-screen bg-background">
        <RepoList />
      </main>
    </>
  );
}
