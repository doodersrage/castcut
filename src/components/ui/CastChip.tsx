'use client';

import { Button } from '@/components/ui/Button';

/**
 * Who a page is about, as one chip (2026-11-05): their plate (or initial), name, a detail — the
 * look, the outfit, or whether there's a plate — and ▾; a click opens that page's Cast sheet.
 * Film, Story, Outfit, Day and Scene each had their own.
 */
export default function CastChip({
  name,
  detail,
  plateUrl,
  status,
  onOpen,
  testId,
  nameTestId,
  title,
  disabled = false,
  className = '',
}: {
  name: string;
  detail?: string;
  plateUrl?: string | null;
  /** A dot: plate ready (ok) or missing (warn). */
  status?: 'ok' | 'warn';
  onOpen: () => void;
  testId: string;
  nameTestId?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="plain"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-label={`${name}${detail ? ` · ${detail}` : ''} — change who or which look`}
      title={title}
      data-testid={testId}
      data-state={status}
      className={`flex w-fit max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3 hover:bg-[var(--bg-hover)] ${
        status === 'warn'
          ? 'border-[var(--tint-warning-border,var(--accent-border))]'
          : 'border-[var(--border-default)]'
      } ${className}`.trim()}
      onClick={onOpen}
    >
      {plateUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the Cast's plate
        <img
          src={plateUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full object-cover object-top"
        />
      ) : (
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-muted)] text-sm font-semibold">
          {(name.trim() || '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="type-label truncate">
        <span data-testid={nameTestId}>{name}</span>
        {detail ? <span className="text-[var(--text-muted)]"> · {detail}</span> : null}
      </span>
      {status ? (
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            status === 'ok'
              ? 'bg-[var(--tint-success-text)]'
              : 'bg-[var(--tint-warning-text,var(--accent-text))]'
          }`}
        />
      ) : null}
      <span aria-hidden className="shrink-0 text-xs text-[var(--text-muted)]">
        ▾
      </span>
    </Button>
  );
}
