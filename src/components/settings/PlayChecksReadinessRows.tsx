'use client';

import type { PlayCheckReadiness, PlayChecksReadiness } from '@/lib/play-checks-readiness';

const ROWS: Array<{ key: keyof Omit<PlayChecksReadiness, 'comfyReachable'>; label: string }> = [
  { key: 'pose', label: 'Pose check (Auto-review)' },
  { key: 'face', label: 'Face check (Auto-review)' },
  { key: 'cutTitles', label: 'Cut titles (server)' },
];

function Row({ label, check }: { label: string; check: PlayCheckReadiness }) {
  return (
    <li className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
      <span
        className="ui-health-dot mt-0.5"
        data-status={check.ready ? 'ok' : 'warn'}
        aria-hidden
      />
      <span>
        <span className="font-medium text-[var(--text-primary)]">{label}</span>
        {' · '}
        {check.ready ? `ready — ${check.detail}` : check.detail}
        {check.install ? (
          <>
            {' — install '}
            <a href={check.install.url} className="ui-text-link" target="_blank" rel="noreferrer">
              {check.install.name}
            </a>
            {' in ComfyUI, restart it, then reload Day / Story'}
          </>
        ) : null}
      </span>
    </li>
  );
}

/** Checklist rows for Play's optional checks, same look as the first-run connection rows. */
export default function PlayChecksReadinessRows({
  readiness,
  checking,
  onRecheck,
}: {
  readiness: PlayChecksReadiness | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  return (
    <div className="mt-3 space-y-1.5" data-testid="play-checks-readiness">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-[var(--text-primary)]">Play checks</p>
        <button
          type="button"
          className="ui-text-link text-xs"
          onClick={onRecheck}
          disabled={checking}
          data-testid="play-checks-recheck"
        >
          {checking ? 'Checking…' : 'Re-check'}
        </button>
      </div>
      {readiness ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {ROWS.map(row => (
            <Row key={row.key} label={row.label} check={readiness[row.key]} />
          ))}
        </ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          {checking ? 'Checking ComfyUI node packs and ffmpeg…' : 'Not checked yet.'}
        </p>
      )}
    </div>
  );
}
