'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AppNav from '@/components/AppNav';
import { useHydrated } from '@/hooks/useHydrated';
import PlayKioskShell from '@/components/PlayKioskShell';
import MobileStudioOfferBanner from '@/components/MobileStudioOfferBanner';
import { isMobileStudioPath } from '@/lib/mobile-studio';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import InventorySyncNotice from '@/components/InventorySyncNotice';

function NavFallback() {
  return (
    <div
      className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_82%,transparent)] backdrop-blur-md lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-[var(--sidebar-width)] lg:border-b-0 lg:border-r"
      aria-hidden
    >
      <div className="flex h-14 items-center gap-3 px-4 lg:h-auto lg:flex-col lg:items-stretch lg:gap-4 lg:p-5">
        <div className="h-8 w-8 shrink-0 rounded-[22%] bg-[var(--bg-active)]" />
        <div className="hidden h-3 w-28 rounded-[var(--radius-full)] bg-[var(--bg-subtle)] lg:block" />
        <div className="mt-2 hidden space-y-2 lg:block">
          <div className="h-8 w-full rounded-[var(--radius-md)] bg-[var(--bg-subtle)]" />
          <div className="h-8 w-full rounded-[var(--radius-md)] bg-[var(--bg-subtle)]" />
          <div className="h-8 w-4/5 rounded-[var(--radius-md)] bg-[var(--bg-subtle)]" />
        </div>
      </div>
    </div>
  );
}

/**
 * The sidebar sits in a Suspense boundary (useSearchParams) that hydrates after the root. By
 * then the auth session and workspace mode may have loaded, so its hydration render no longer
 * matched the server's signed-out shell (React #418, under load). Render the placeholder until
 * hydrated — it's what the server sends — then the live nav.
 */
function HydratedAppNav() {
  const hydrated = useHydrated();
  return hydrated ? <AppNav /> : <NavFallback />;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workspaceMode = useWorkspaceMode();
  const mobileStudio = isMobileStudioPath(pathname);
  const playKiosk = workspaceMode === 'play' && !mobileStudio;

  return (
    <div
      className={
        mobileStudio || playKiosk
          ? 'relative z-[1] min-h-full'
          : 'relative z-[1] min-h-full lg:pl-[var(--sidebar-width)]'
      }
    >
      {mobileStudio ? null : playKiosk ? (
        <PlayKioskShell />
      ) : (
        <Suspense fallback={<NavFallback />}>
          <HydratedAppNav />
        </Suspense>
      )}
      {!mobileStudio ? <MobileStudioOfferBanner /> : null}
      <InventorySyncNotice />
      {playKiosk ? (
        <div className="pt-[calc(4.75rem+env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
