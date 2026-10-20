import type { ReactNode } from 'react';
import BrandBars from '@/components/BrandBars';
import BrandMark from '@/components/BrandMark';
import PageCanvas from '@/components/ui/PageCanvas';
import type { ToolAccent } from '@/lib/app/tool-theme';

type SystemPageShellProps = {
  accent?: ToolAccent;
  overline: string;
  title: string;
  description: string;
  children?: ReactNode;
};

/** Shared branded shell for login-adjacent system pages (403 / 404 / error). */
export default function SystemPageShell({
  accent = 'neutral',
  overline,
  title,
  description,
  children,
}: SystemPageShellProps) {
  return (
    <PageCanvas accent={accent}>
      <div className="page-enter mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-4 py-20 text-center">
        <BrandMark
          size={40}
          withWordmark
          wordmarkClassName="type-brand type-title tracking-tight"
        />
        <div className="space-y-2">
          <p className="type-overline flex items-center justify-center gap-2 text-[var(--text-muted)]">
            <BrandBars />
            {overline}
          </p>
          <h1 className="type-display text-[1.5rem] text-[var(--text-primary)]">{title}</h1>
          <p className="type-body text-[var(--text-secondary)]">{description}</p>
        </div>
        {children}
      </div>
    </PageCanvas>
  );
}
