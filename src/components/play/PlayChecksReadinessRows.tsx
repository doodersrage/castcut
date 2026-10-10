'use client';

import { useState } from 'react';
import CastcutNodesHint from '@/components/CastcutNodesHint';
import VisionModelDownload from '@/components/settings/VisionModelDownload';
import type { PlayCheckReadiness, PlayChecksReadiness } from '@/lib/play-checks-readiness';

const ROWS: Array<{ key: keyof Omit<PlayChecksReadiness, 'comfyReachable'>; label: string }> = [
  { key: 'pose', label: 'Pose check (Auto-review)' },
  { key: 'face', label: 'Face check (Auto-review)' },
  { key: 'cutTitles', label: 'Cut titles (server)' },
  { key: 'review', label: 'Still review (vision model)' },
  { key: 'adultGate', label: 'Adult check (not an Auto-review switch)' },
  { key: 'talkFace', label: 'Talking-clip face pass (ReActor)' },
];

function Row({
  label,
  check,
  installing,
  busy,
  onInstall,
  onRecheck,
}: {
  label: string;
  check: PlayCheckReadiness;
  /** Re-run the readiness probe (after a download). */
  onRecheck?: () => void;
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
        {check.command ? <CommandLine command={check.command} note={check.note} /> : null}
        {check.offerVisionDownload && onRecheck ? <VisionModelDownload onDone={onRecheck} /> : null}
      </span>
    </li>
  );
}

/** A command to run on the ComfyUI machine, with a copy button. */
function CommandLine({ command, note }: { command: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1 block space-y-1" data-testid="play-checks-command">
      <span className="flex items-center gap-2">
        <code className="break-all rounded bg-[var(--bg-muted)]/60 px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
          {command}
        </code>
        <button
          type="button"
          className="ui-text-link shrink-0"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(command)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
      {note ? <span className="block text-[var(--text-muted)]">{note}</span> : null}
    </span>
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
  const [installing, setInstalling] = useState<'pose' | 'face' | 'talkFace' | null>(null);
  const [installNote, setInstallNote] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  /**
   * Run the face and pose checks once on a sample picture: what they download on first use
   * (InsightFace, DWPose models) comes down now, not during the first check of a Day.
   */
  const prepare = async () => {
    if (preparing) return;
    setPreparing(true);
    setPrepareNote(
      'Running the checks once on a sample picture — the first time can download several hundred MB…'
    );
    try {
      const { loadComfyUiSettings } = await import('@/lib/comfyui-settings');
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const response = await fetch('/api/play-checks/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comfyUrl ? { comfyUrl } : {}),
      });
      const data = (await response.json()) as { summary?: string; error?: string };
      setPrepareNote(
        response.ok
          ? (data.summary ?? 'Done.')
          : (data.error ?? `Failed (HTTP ${response.status}).`)
      );
    } catch (error) {
      setPrepareNote(error instanceof Error ? error.message : 'Preparing the checks failed.');
    } finally {
      setPreparing(false);
      onRecheck();
    }
  };
  const install = async (key: 'pose' | 'face' | 'talkFace') => {
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
        {readiness?.comfyReachable && (readiness.pose.ready || readiness.face.ready) ? (
          <button
            type="button"
            className="ui-text-link text-xs"
            onClick={() => void prepare()}
            disabled={preparing || checking}
            title="Run the face and pose checks once now, so their models download during setup"
            data-testid="play-checks-prepare"
          >
            {preparing ? 'Preparing…' : 'Prepare checks'}
          </button>
        ) : null}
      </div>
      {readiness ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {ROWS.map(row => {
            const check = readiness[row.key];
            if (!check) return null;
            const installable = row.key === 'pose' || row.key === 'face' || row.key === 'talkFace';
            return (
              <Row
                key={row.key}
                label={row.label}
                check={check}
                installing={installing === row.key}
                busy={installing !== null}
                onRecheck={onRecheck}
                onInstall={
                  installable && !check.ready && check.install
                    ? () => void install(row.key as 'pose' | 'face' | 'talkFace')
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
      {readiness?.comfyReachable ? (
        <CastcutNodesHint testId="play-checks-castcut-hint">
          Castcut nodes are not on this ComfyUI: Best of two and cut-outs take extra jobs.
        </CastcutNodesHint>
      ) : null}
      {prepareNote ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="play-checks-prepare-note">
          {prepareNote}
        </p>
      ) : null}
      {installNote ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="play-checks-install-note">
          {installNote}
        </p>
      ) : null}
    </div>
  );
}
