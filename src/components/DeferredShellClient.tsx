'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import SystemTrayCelebrateOverlay from '@/components/SystemTrayCelebrateOverlay';
import CommandPaletteEager from '@/components/CommandPalette';

const CommandPaletteLazy = dynamic(() => import('@/components/CommandPalette'), {
  ssr: false,
});

const ScheduledBatchRunner = dynamic(() => import('@/components/ScheduledBatchRunner'), {
  ssr: false,
});

const KeyboardShortcuts = dynamic(() => import('@/components/KeyboardShortcuts'), {
  ssr: false,
});

const GalleryPwaRegister = dynamic(() => import('@/components/GalleryPwaRegister'), {
  ssr: false,
});

// "Fix an area" takes that render after their dialog closed: the chip / toast and the reopened
// results live here, on every page.
const FixAreaTray = dynamic(() => import('@/components/fix-area/FixAreaTray'), {
  ssr: false,
  loading: () => null,
});
const SystemTray = dynamic(() => import('@/components/SystemTray'), {
  ssr: false,
});

const AppUpdateWatcher = dynamic(() => import('@/components/AppUpdateWatcher'), {
  ssr: false,
});
const WorkflowLibraryWatcher = dynamic(() => import('@/components/WorkflowLibraryWatcher'), {
  ssr: false,
});

const EngineHealthWatcher = dynamic(() => import('@/components/EngineHealthWatcher'), {
  ssr: false,
});

const WorkspaceWelcome = dynamic(() => import('@/components/WorkspaceWelcome'), {
  ssr: false,
});

const FirstQueueSetupModal = dynamic(() => import('@/components/FirstQueueSetupModal'), {
  ssr: false,
});

function scheduleIdle(callback: () => void, timeoutMs: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, Math.min(timeoutMs, 1500));
  return () => window.clearTimeout(id);
}

export default function DeferredShellClient() {
  const playwright = process.env.NEXT_PUBLIC_PLAYWRIGHT === '1';
  // Playwright needs CommandPalette / shortcuts on first Ctrl+K — idle defer loses the keypress.
  const [toastReady, setToastReady] = useState(playwright);
  const [shellReady, setShellReady] = useState(playwright);
  const [batchEnabled, setBatchEnabled] = useState(false);
  const CommandPalette = playwright ? CommandPaletteEager : CommandPaletteLazy;

  useEffect(() => {
    let cancelled = false;

    void import('@/lib/scheduled-batch').then(({ loadScheduledBatchConfig }) => {
      if (cancelled) {
        return;
      }
      if (loadScheduledBatchConfig().enabled) {
        setBatchEnabled(true);
      }
    });

    if (playwright) {
      return () => {
        cancelled = true;
      };
    }

    const enableToast = () => {
      if (!cancelled) {
        setToastReady(true);
      }
    };
    const enableShell = () => {
      if (!cancelled) {
        setShellReady(true);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        enableShell();
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: true });

    // Toast feedback should appear quickly after first paint.
    const cancelToastIdle = scheduleIdle(enableToast, 400);
    const cancelShellIdle = scheduleIdle(enableShell, 7000);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
      cancelToastIdle();
      cancelShellIdle();
    };
  }, [playwright]);

  return (
    <>
      {batchEnabled || shellReady ? <ScheduledBatchRunner /> : null}
      <SystemTrayCelebrateOverlay />
      {toastReady || shellReady ? <SystemTray /> : null}
      {toastReady || shellReady ? <FixAreaTray /> : null}
      {shellReady ? (
        <>
          <KeyboardShortcuts />
          <CommandPalette />
          <GalleryPwaRegister />
          <WorkspaceWelcome />
          <FirstQueueSetupModal />
          <AppUpdateWatcher />
          <WorkflowLibraryWatcher />
          {playwright ? null : <EngineHealthWatcher />}
        </>
      ) : null}
    </>
  );
}
