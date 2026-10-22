'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  keeperStandInDayLine,
  keeperStandInLine,
  type KeeperStandInStatus,
} from '@/lib/fitting/keeper-stand-in';

type Props = {
  status: KeeperStandInStatus | null | undefined;
  busy?: boolean;
  onMake: () => Promise<boolean> | void;
  /** Day's status strip: Day's own short line and test ids (day-keeper-standing*). */
  place?: 'outfit' | 'day';
  className?: string;
};

/**
 * Under Outfit's Try panel: the standing picture a posed Keep renders for Day and Story
 * (fitting/keeper-stand-in.ts) — rendering, ready (with its thumbnail), failed (try again), or
 * offered with one tap for a posed Keep made before it existed. Day shows it too (place="day"):
 * Keep jumps there while the render runs.
 */
export default function FittingKeeperStandInNote({
  status,
  busy = false,
  onMake,
  place = 'outfit',
  className = '',
}: Props) {
  const [sending, setSending] = useState(false);
  const line =
    place === 'day' ? keeperStandInDayLine(status?.state) : keeperStandInLine(status?.state);
  const testId = place === 'day' ? 'day-keeper-standing' : 'fitting-keeper-standing';
  if (!status || !line) return null;
  const action =
    status.state === 'offer'
      ? 'Make a standing picture'
      : status.state === 'failed'
        ? 'Try again'
        : null;
  return (
    <div
      className={`flex items-center gap-2 ${className}`.trim()}
      data-testid={testId}
      data-state={status.state}
      role="status"
    >
      {status.state === 'ready' && status.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={status.imageUrl}
          alt="Her standing picture for Day and Story"
          className={`${place === 'day' ? 'h-8 w-6' : 'h-12 w-8'} shrink-0 rounded object-cover`}
          data-testid={`${testId}-picture`}
        />
      ) : null}
      <p className="type-caption min-w-0 flex-1 text-[var(--text-muted)]">{line}</p>
      {action ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || sending}
          data-testid={`${testId}-make`}
          onClick={() => {
            setSending(true);
            void Promise.resolve(onMake()).finally(() => setSending(false));
          }}
        >
          {sending ? 'Queuing…' : action}
        </Button>
      ) : null}
    </div>
  );
}
