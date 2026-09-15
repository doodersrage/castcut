'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export type PlaySoftAdvanceTarget = {
  href: string;
  label: string;
  /** Override countdown copy (defaults to “Continuing to {label}…”). */
  message?: string;
  /** Bump to restart the countdown for the same href. */
  nonce: number;
};

const DELAY_SEC = 3;

type PlaySoftAdvanceBannerProps = {
  target: PlaySoftAdvanceTarget | null;
  onCancel: () => void;
};

/** Cancellable countdown before navigating to the next film step. */
export default function PlaySoftAdvanceBanner({ target, onCancel }: PlaySoftAdvanceBannerProps) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(DELAY_SEC);

  useEffect(() => {
    if (!target?.href) {
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, DELAY_SEC - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(timer);
        router.push(target.href);
      }
    }, 200);
    return () => {
      window.clearInterval(timer);
    };
  }, [router, target?.href, target?.label, target?.message, target?.nonce]);

  if (!target?.href) {
    return null;
  }

  const lead = target.message?.trim() || `Continuing to ${target.label}`;

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2"
      data-testid="play-soft-advance"
      role="status"
    >
      <p className="type-caption text-[var(--text-primary)]">
        {lead} in {secondsLeft}s…
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          data-testid="play-soft-advance-go"
          onClick={() => {
            onCancel();
            router.push(target.href);
          }}
        >
          Go now
        </Button>
        <Button size="sm" variant="ghost" data-testid="play-soft-advance-cancel" onClick={onCancel}>
          Stay here
        </Button>
      </div>
    </div>
  );
}
