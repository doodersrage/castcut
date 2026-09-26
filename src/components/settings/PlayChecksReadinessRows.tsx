'use client';

import { useState } from 'react';
import type { PlayCheckReadiness, PlayChecksReadiness } from '@/lib/play-checks-readiness';

const ROWS: Array<{ key: keyof Omit<PlayChecksReadiness, 'comfyReachable'>; label: string }> = [
  { key: 'pose', label: 'Pose check (Auto-review)' },
  { key: 'face', label: 'Face check (Auto-review)' },
  { key: 'cutTitles', label: 'Cut titles (server)' },
  { key: 'review', label: 'Still review (vision model)' },
];

function Row({
  label,
  check,
  installing,
  busy,
  onInstall,
}: {
  label: string;
  check: PlayCheckReadiness;
  installing?: boolean;
  /** Another install is running. */
  busy?: boolean;
  /** Install the pack through ComfyUI-Manager (pose / face rows). */
  onInstall?: () => void;
}) {
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
            {' — '}
            {onInstall ? (
              <button
                type="button"
                className="ui-text-link"
                disabled={installing || busy}
                onClick={onInstall}
                data-testid={`play-checks-install-${check.install.name}`}
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            ) : null}
            {onInstall ? ' ' : 'install '}
            <a href={check.install.url} className="ui-text-link" target="_blank" rel="noreferrer">
              {check.install.name}
            </a>
            {onInstall
              ? ' with ComfyUI-Manager (ComfyUI restarts)'
              : ' in ComfyUI, restart it, then reload Day / Story'}
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
  const [installing, setInstalling] = useState<'pose' | 'face' | null>(null);
  const [installNote, setInstallNote] = useState<string | null>(null);
  const install = async (key: 'pose' | 'face') => {
    if (installing) return;
    setInstalling(key);
    setInstallNote(null);
    try {
      const [
        { requestComfyManagerInstall, PLAY_CHECK_INSTALL_NODE_TYPES },
        { loadComfyUiSettings },
      ] = await Promise.all([
        import('@/lib/comfyui-manager-install-client'),
        import('@/lib/comfyui-settings'),
      ]);
      const result = await requestComfyManagerInstall({
        nodeTypes: PLAY_CHECK_INSTALL_NODE_TYPES[key],
        comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
        restart: true,
      });
      setInstallNote(result.message || (result.ok ? 'Installed.' : 'Install failed.'));
    } catch (error) {
      setInstallNote(error instanceof Error ? error.message : 'Install failed.');
    } finally {
      setInstalling(null);
      onRecheck();
    }
  };
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
          {ROWS.map(row => {
            const check = readiness[row.key];
            if (!check) return null;
            const installable = row.key === 'pose' || row.key === 'face';
            return (
              <Row
                key={row.key}
                label={row.label}
                check={check}
                installing={installing === row.key}
                busy={installing !== null}
                onInstall={
                  installable && !check.ready && check.install
                    ? () => void install(row.key as 'pose' | 'face')
                    : undefined
                }
              />
            );
          })}
        </ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          {checking ? 'Checking ComfyUI node packs and ffmpeg…' : 'Not checked yet.'}
        </p>
      )}
      {installNote ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="play-checks-install-note">
          {installNote}
        </p>
      ) : null}
    </div>
  );
}
