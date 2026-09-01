'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function WorkspaceChangesRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const params = searchParams.toString();
    router.replace(params ? `/workspace?${params}` : '/workspace');
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner"></span>
    </div>
  );
}

export default function WorkspaceChangesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="loading loading-spinner"></span></div>}>
      <WorkspaceChangesRedirect />
    </Suspense>
  );
}
