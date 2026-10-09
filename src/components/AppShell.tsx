'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AppNav from '@/components/AppNav';
import { useHydrated } from '@/hooks/useHydrated';
import MobileStudioOfferBanner from '@/components/MobileStudioOfferBanner';
import { isMobileStudioPath } from '@/lib/mobile-studio';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import type { WorkspaceMode } from '@/lib/workspace-mode';
import InventorySyncNotice from '@/components/InventorySyncNotice';
// Nearly every route renders ToolLayout. Loaded here it ships once in the shared chunk; when the
// last shell import of it went away (sidebar theme control), Turbopack copied it into ~22 route
// chunks — +228 KB gzip across the build and the size-limit CI failure.
import '@/components/ui/ToolPageShell';
// The same for the small modules nearly every tool page uses. Under Next 16.2 (what CI and the
// release image build with) each sat in 12–33 route chunks; here they ship once. Measured on
// that build: 3.61 MB → under the 3.5 MB budget, for a few KB of first-load JS.
import '@/components/shared-tool-controls/CharacterOsPicker';
import '@/components/ui/Button';
import '@/components/ui/Field';
import '@/components/ui/GalleryKindPreview';
import '@/components/ui/MotionMedia';
import '@/components/ui/UiIcon';
import '@/components/ui/ViewState';
import '@/hooks/useCachedSettings';
import '@/hooks/usePromptHistory';
import '@/lib/diffusers-defaults';
import '@/lib/diffusers-workflow-support';
import '@/lib/experiment-groups';
import '@/lib/generate-handoff';
import '@/lib/plugin-queue-hooks';
import '@/lib/prompt-lineage-session';
import '@/lib/prompt-versioning';
import '@/lib/session-recipes';
import '@/lib/video-last-frame';
// Components most tool pages render (queue bar, job status, toasts, setup banner…): 12–38 route
// chunks each on CI's build. Shared here they cost the shell ~7 KB gzip and save ~90 KB overall.
// (Measured: bare imports of a few plain queue libs did not move them — they can be dropped as
// side-effect free. Check the build after adding one here.)
import '@/components/MobileStickyQueueBar';
import '@/components/PromptDiagnosticsPanel';
import '@/components/ToolSetupBanner';
import '@/components/ui/ComfyUiJobStatusPanel';
import '@/components/ui/PageCanvas';
import '@/components/ui/StatusToastStrip';

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

/**
 * A full-screen mode an app plugs into the shell (Castcut: the Film kiosk in the Play workspace):
 * its own header in place of the sidebar, and padding around the page for that header and dock.
 * Given by the root layout, so the shared shell names no feature (docs/architecture-boundaries.md).
 */
export type ShellKiosk = {
  workspace: WorkspaceMode;
  header: ReactNode;
  contentClassName: string;
};

export default function AppShell({ children, kiosk }: { children: ReactNode; kiosk?: ShellKiosk }) {
  const pathname = usePathname();
  const workspaceMode = useWorkspaceMode();
  const mobileStudio = isMobileStudioPath(pathname);
  const kioskOn = Boolean(kiosk) && workspaceMode === kiosk?.workspace && !mobileStudio;

  return (
    <div
      className={
        mobileStudio || kioskOn
          ? 'relative z-[1] min-h-full'
          : 'relative z-[1] min-h-full lg:pl-[var(--sidebar-width)]'
      }
    >
      {mobileStudio ? null : kioskOn ? (
        kiosk?.header
      ) : (
        <Suspense fallback={<NavFallback />}>
          <HydratedAppNav />
        </Suspense>
      )}
      {/* A kiosk is already a phone-style experience (Film) — the offer hid under its fixed header and
          only pushed the page down 43 px. */}
      {!mobileStudio && !kioskOn ? <MobileStudioOfferBanner /> : null}
      <InventorySyncNotice />
      {kioskOn ? <div className={kiosk?.contentClassName}>{children}</div> : children}
    </div>
  );
}
