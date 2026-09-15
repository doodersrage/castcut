'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  dismissMobileStudioOffer,
  MOBILE_STUDIO_HOME,
  MOBILE_STUDIO_OFFER_MQ,
  shouldOfferMobileStudio,
} from '@/lib/mobile-studio-offer';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

/** Narrow-viewport offer to switch into Mobile Studio (/m). */
export default function MobileStudioOfferBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setVisible(shouldOfferMobileStudio(pathname));
      });
    };
    refresh();
    const mq = window.matchMedia(MOBILE_STUDIO_OFFER_MQ);
    mq.addEventListener('change', refresh);
    return () => mq.removeEventListener('change', refresh);
  }, [pathname]);

  if (!visible) {
    return null;
  }

  return (
    <div
      data-testid="mobile-studio-offer"
      className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-2 text-xs text-[var(--accent-text)] lg:hidden"
    >
      <p className="min-w-0 leading-snug">
        On a phone? <span className="font-medium">Mobile Studio</span> is a first-class film loop —
        capture plates, rate stills, Look / Outfit / Day / Story / Cut — while desk handles heavy
        Generate.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--accent-border)] px-2 py-1 transition hover:bg-[var(--bg-base)]/40"
          onClick={() => {
            dismissMobileStudioOffer();
            setVisible(false);
          }}
        >
          Not now
        </button>
        <Link
          href={MOBILE_STUDIO_HOME}
          className="rounded-lg border border-[var(--accent-border)] bg-[var(--bg-base)]/50 px-2.5 py-1 font-medium transition hover:brightness-110"
          onClick={() => dismissMobileStudioOffer()}
        >
          Open
        </Link>
      </div>
    </div>
  );
}
