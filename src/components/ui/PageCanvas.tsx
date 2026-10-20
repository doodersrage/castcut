'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { accentForPath, type ToolAccent } from '@/lib/app/tool-theme';

type PageCanvasProps = {
  children: ReactNode;
  accent?: ToolAccent;
};

export default function PageCanvas({ children, accent: accentProp }: PageCanvasProps) {
  const pathname = usePathname();
  const accent = accentProp ?? accentForPath(pathname);

  return (
    <div className="page-canvas min-h-full flex-1" data-accent={accent}>
      <main className="mx-auto w-full">{children}</main>
    </div>
  );
}
