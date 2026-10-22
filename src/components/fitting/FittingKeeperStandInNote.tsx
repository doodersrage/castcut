'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { keeperStandInLine, type KeeperStandInStatus } from '@/lib/fitting/keeper-stand-in';

type Props = {
  status: KeeperStandInStatus | null | undefined;
  busy?: boolean;
  onMake: () => Promise<boolean> | void;
};

/**
 * Under Outfit's Try panel: the standing picture a posed Keep renders for Day and Story
 * (fitting/keeper-stand-in.ts) — rendering, ready (with its thumbnail), failed (try again), or
 * offered with one tap for a posed Keep made before it existed.
 */
export default function FittingKeeperStandInNote({ status, busy = false, onMake }: Props) {
  const [sending, setSending] = useState(false);
  const line = keeperStandInLine(status?.state);
  if (!status || !line) return null;
  const action =
    status.state === 'offer'
      ? 'Make a standing picture'
      : status.state === 'failed'
        ? 'Try again'
        : null;
  return (
    <div
      className="flex items-center gap-2"
      data-testid="fitting-keeper-standing"
      data-state={status.state}
      role="status"
    >
      {status.state === 'ready' && status.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={status.imageUrl}
          alt="Her standing picture for Day and Story"
          className="h-12 w-8 shrink-0 rounded object-cover"
          data-testid="fitting-keeper-standing-picture"
        />
      ) : null}
      <p className="type-caption min-w-0 flex-1 text-[var(--text-muted)]">{line}</p>
      {action ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || sending}
          data-testid="fitting-keeper-standing-make"
          onClick={() => {
            setSending(true);
            void Promise.resolve(onMake()).finally(() => setSending(false));
          }}
        >
          {action}
        </Button>
      ) : null}
    </div>
  );
}
