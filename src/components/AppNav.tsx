'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { choosePhoneView } from '@/lib/phone-view';
import BrandMark from '@/components/BrandMark';
import ActiveJobsChip from '@/components/ActiveJobsChip';
import { AppNavSidebarContent } from '@/components/app-nav/AppNavSidebarContent';

export default function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMobileOpen(false);
    });
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] py-0.5 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          <BrandMark
            size={28}
            withWordmark
            wordmarkClassName="type-brand type-heading tracking-tight"
          />
        </Link>
        <div className="flex items-center gap-2">
          <ActiveJobsChip />
          <Link href="/m" className="ui-btn-secondary px-3 py-2" onClick={() => choosePhoneView()}>
            Phone
          </Link>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen(open => !open)}
            className="ui-btn-secondary px-3 py-2"
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="ui-overlay fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[var(--sidebar-width)] border-r border-[var(--border-subtle)] bg-[var(--bg-muted)] py-5 transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AppNavSidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
