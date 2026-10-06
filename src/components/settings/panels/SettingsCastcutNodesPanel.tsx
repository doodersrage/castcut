'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import {
  CASTCUT_NODES_BENEFITS,
  CASTCUT_NODES_DOCS_URL,
  CASTCUT_NODES_FILE_NAME,
  CASTCUT_NODES_FILE_ROUTE,
  CASTCUT_NODES_WITHOUT,
  buildCastcutInstallCommands,
  castcutRestartGate,
  chooseCastcutNodesAction,
  describeCastcutHealth,
  describeCastcutNodesStatus,
  type CastcutInstallCommand,
  type CastcutNodesStatus,
  type ComfyUiSystemInfo,
} from '@/lib/castcut-nodes-setup';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type Report = {
  reachable: boolean;
  status: CastcutNodesStatus | null;
  manager: { version: string; api: 'v1' | 'v2' } | null;
  queue: { running: number; pending: number } | null;
  system: ComfyUiSystemInfo | null;
  needsAuth?: boolean;
  health?: {
    faceAnalysis: boolean;
    dwpose: boolean;
    vram?: { freeBytes: number; totalBytes: number };
  } | null;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'installed'; message: string }
  | { kind: 'confirm-restart' }
  | { kind: 'restarting'; note: string }
  | { kind: 'restarted'; message: string; ok: boolean };

const RESTART_WAIT_MS = 180_000;

async function fetchReport(comfyUrl?: string): Promise<Report> {
  const query = comfyUrl?.trim() ? `?comfyUrl=${encodeURIComponent(comfyUrl.trim())}` : '';
  const response = await fetch(`/api/comfyui/castcut-nodes${query}`, { cache: 'no-store' });
  const data = (await response.json()) as Report & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Check failed (HTTP ${response.status}).`);
  }
  return data;
}

function CommandBlock({
  command,
  onCopy,
}: {
  command: CastcutInstallCommand;
  onCopy: (command: CastcutInstallCommand) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid={`castcut-nodes-command-${command.id}`}>
      <p className="text-xs font-medium text-[var(--text-primary)]">{command.label}</p>
      <pre
        className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2 font-mono text-xs text-[var(--text-primary)]"
        aria-label={`${command.label} command`}
      >
        {command.command}
      </pre>
      <div className="flex flex-wrap items-start gap-2">
        <Button size="sm" variant="secondary" onClick={() => onCopy(command)}>
          Copy
        </Button>
        {command.note ? (
          <p className="type-caption min-w-0 flex-1 text-[var(--text-muted)]">{command.note}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Settings → ComfyUI → Castcut nodes: is the optional node pack on this ComfyUI, which version,
 * and ONE way to get it there — ComfyUI-Manager when it can, the copy commands otherwise — then
 * a guarded ComfyUI restart and a re-check.
 */
export default function SettingsCastcutNodesPanel({
  comfyUrl,
  setStatus,
}: {
  comfyUrl?: string;
  setStatus: (status: string | null) => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [managerError, setManagerError] = useState<string | null>(null);
  const restartAbort = useRef(false);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setReport(await fetchReport(comfyUrl));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Check failed.');
    } finally {
      setChecking(false);
    }
  }, [comfyUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void check();
    });
    return () => {
      restartAbort.current = true;
    };
  }, [check]);

  const status = report?.status ?? null;
  const healthLine = describeCastcutHealth(report?.health ?? null);
  const managerPresent = Boolean(report?.manager);
  const action = chooseCastcutNodesAction({
    status,
    managerPresent,
    managerRefused: Boolean(managerError),
  });
  const restartGate = castcutRestartGate(report?.queue ?? null);
  const showRestart =
    managerPresent &&
    (phase.kind === 'installed' ||
      phase.kind === 'confirm-restart' ||
      // After a copy by hand (an update, or once the Manager refused) the restart is still one click.
      (action !== 'none' && (status?.state !== 'missing' || Boolean(managerError))));

  // While a restart waits on the render queue, keep the count fresh.
  useEffect(() => {
    if (!showRestart || restartGate.allowed) return;
    const timer = window.setInterval(() => void check(), 5_000);
    return () => window.clearInterval(timer);
  }, [check, restartGate.allowed, showRestart]);

  const commands = useMemo(
    () =>
      buildCastcutInstallCommands({
        system: report?.system ?? null,
        // Only rendered once a report is in, i.e. in the browser.
        appOrigin: typeof window === 'undefined' ? 'http://<this app>' : window.location.origin,
        needsAuth: report?.needsAuth,
      }),
    [report?.needsAuth, report?.system]
  );
  const recommended = commands.filter(command => command.recommended);
  const others = commands.filter(command => !command.recommended);

  async function copy(command: CastcutInstallCommand) {
    try {
      await navigator.clipboard.writeText(command.command);
      setStatus(`Copied the ${command.label} command.`);
    } catch {
      setStatus('Could not copy — select the command and copy it by hand.');
    }
  }

  async function installWithManager() {
    setPhase({ kind: 'installing' });
    setManagerError(null);
    try {
      const response = await fetch('/api/comfyui/castcut-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', ...(comfyUrl?.trim() ? { comfyUrl } : {}) }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setManagerError(data.error ?? `Install failed (HTTP ${response.status}).`);
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({
        kind: 'installed',
        message: data.message ?? 'Installed. Restart ComfyUI to load the nodes.',
      });
      void check();
    } catch (installError) {
      setManagerError(installError instanceof Error ? installError.message : 'Install failed.');
      setPhase({ kind: 'idle' });
    }
  }

  async function restart() {
    restartAbort.current = false;
    setPhase({ kind: 'restarting', note: 'Asking ComfyUI-Manager to restart ComfyUI…' });
    const [{ restartComfyUi }, { clearComfyObjectInfoCache }] = await Promise.all([
      import('@/lib/comfyui-queue-control'),
      import('@/lib/comfyui-object-info-cache'),
    ]);
    const result = await restartComfyUi(comfyUrl?.trim() || undefined);
    if (!result.ok) {
      setPhase({
        kind: 'restarted',
        ok: false,
        message: result.error ?? 'ComfyUI-Manager did not restart ComfyUI. Restart it by hand.',
      });
      return;
    }
    setPhase({ kind: 'restarting', note: 'Restarting — waiting for ComfyUI to come back…' });
    const started = Date.now();
    // Give the old process a moment to go away before the first probe.
    await new Promise(resolve => setTimeout(resolve, 3_000));
    while (!restartAbort.current && Date.now() - started < RESTART_WAIT_MS) {
      try {
        const next = await fetchReport(comfyUrl);
        if (next.reachable) {
          setReport(next);
          clearComfyObjectInfoCache();
          const loaded = next.status && next.status.state !== 'missing';
          setPhase({
            kind: 'restarted',
            ok: Boolean(loaded),
            message: next.status
              ? `ComfyUI is back. ${describeCastcutNodesStatus(next.status)}${
                  loaded
                    ? ''
                    : " If you just installed them, ComfyUI's log says why they did not load."
                }`
              : 'ComfyUI is back.',
          });
          return;
        }
      } catch {
        // still down
      }
      await new Promise(resolve => setTimeout(resolve, 3_000));
    }
    if (!restartAbort.current) {
      setPhase({
        kind: 'restarted',
        ok: false,
        message:
          'ComfyUI has not come back after 3 minutes. Check its terminal or service log, then Check again.',
      });
    }
  }

  const busy = checking || phase.kind === 'installing' || phase.kind === 'restarting';
  const stateLabel = !report
    ? checking
      ? 'Checking…'
      : 'Not checked'
    : !report.reachable
      ? 'ComfyUI unreachable'
      : status?.state === 'missing'
        ? 'Missing'
        : status?.state === 'outdated' || status?.state === 'partial'
          ? 'Outdated'
          : 'Installed';

  return (
    <ToolSection
      id="settings-comfyui-castcut-nodes"
      title="Castcut nodes"
      description="Optional ComfyUI node pack that runs Castcut's checks inside the job."
      data-testid="castcut-nodes-card"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="ui-health-dot"
            data-status={
              status?.state === 'current' || status?.state === 'newer'
                ? 'ok'
                : report?.reachable === false
                  ? 'error'
                  : 'warn'
            }
            aria-hidden
          />
          <p
            className="text-sm font-medium text-[var(--text-primary)]"
            data-testid="castcut-nodes-state"
            data-state={status?.state ?? (report && !report.reachable ? 'unreachable' : 'unknown')}
          >
            {stateLabel}
            {status?.installedVersion ? ` · v${status.installedVersion}` : ''}
          </p>
          <button
            type="button"
            className="ui-text-link text-xs"
            onClick={() => void check()}
            disabled={busy}
            data-testid="castcut-nodes-recheck"
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
        {status ? (
          <p
            className="text-sm text-[var(--text-secondary)]"
            data-testid="castcut-nodes-status-line"
          >
            {describeCastcutNodesStatus(status)}
          </p>
        ) : report && !report.reachable ? (
          <p className="text-sm text-[var(--text-secondary)]">
            ComfyUI did not answer — check the connection above, then Check again.
          </p>
        ) : null}
        {status && healthLine ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="castcut-nodes-health-line"
          >
            {healthLine}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <ul className="type-caption list-disc space-y-1 pl-5 text-[var(--text-secondary)]">
          {CASTCUT_NODES_BENEFITS.map(line => (
            <li key={line}>{line}</li>
          ))}
          <li className="text-[var(--text-muted)]">{CASTCUT_NODES_WITHOUT}</li>
        </ul>

        {action === 'manager' && phase.kind !== 'installed' ? (
          <div className="space-y-2" data-testid="castcut-nodes-manager">
            <Button
              variant="primary"
              onClick={() => void installWithManager()}
              disabled={busy}
              data-testid="castcut-nodes-install-manager"
            >
              {phase.kind === 'installing'
                ? 'Installing…'
                : status?.state === 'missing'
                  ? 'Install with ComfyUI-Manager'
                  : 'Update with ComfyUI-Manager'}
            </Button>
            <p className="type-caption text-[var(--text-muted)]">
              ComfyUI-Manager {report?.manager?.version} found. It fetches the pack, then ComfyUI
              needs a restart to load it.
            </p>
          </div>
        ) : null}

        {managerError ? (
          <div
            role="alert"
            className="space-y-1 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5"
            data-testid="castcut-nodes-manager-error"
          >
            <p className="text-xs leading-relaxed text-[var(--tint-warning-text)]">
              {managerError}
            </p>
            <button
              type="button"
              className="ui-text-link type-caption"
              onClick={() => setManagerError(null)}
            >
              Try ComfyUI-Manager again
            </button>
          </div>
        ) : null}

        {phase.kind === 'installed' ? (
          <p role="status" className="text-sm text-[var(--tint-success-text)]">
            {phase.message}
          </p>
        ) : null}

        {showRestart ? (
          <div className="space-y-2" data-testid="castcut-nodes-restart">
            {phase.kind === 'confirm-restart' ? (
              <div className="space-y-2 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5">
                <p className="text-xs leading-relaxed text-[var(--tint-warning-text)]">
                  Restarting ComfyUI stops anything it is rendering and empties its queue — for
                  everyone using this ComfyUI. It takes a minute or two to come back.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!restartGate.allowed}
                    onClick={() => void restart()}
                    data-testid="castcut-nodes-restart-confirm"
                  >
                    {restartGate.allowed ? 'Restart now' : restartGate.label}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !restartGate.allowed}
                onClick={() => setPhase({ kind: 'confirm-restart' })}
                data-testid="castcut-nodes-restart-open"
                title={
                  restartGate.allowed
                    ? 'Restart ComfyUI through ComfyUI-Manager to load the nodes'
                    : 'ComfyUI is rendering — the restart would stop it'
                }
              >
                {restartGate.label}
              </Button>
            )}
          </div>
        ) : null}

        {phase.kind === 'restarting' ? (
          <p role="status" className="type-caption text-[var(--text-secondary)]">
            {phase.note}
          </p>
        ) : null}
        {phase.kind === 'restarted' ? (
          <p
            role="status"
            className={`text-sm ${phase.ok ? 'text-[var(--tint-success-text)]' : 'text-[var(--text-secondary)]'}`}
            data-testid="castcut-nodes-restart-result"
          >
            {phase.message}
          </p>
        ) : null}

        {report?.reachable && (action === 'copy' || action === 'manager') ? (
          <details
            className="space-y-3"
            open={action === 'copy' || Boolean(managerError)}
            data-testid="castcut-nodes-copy"
          >
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">
              {action === 'copy' ? 'Install by copying one file' : 'Or install by hand'}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="type-caption text-[var(--text-muted)]">
                The pack is one file, {CASTCUT_NODES_FILE_NAME}. Put it in ComfyUI&apos;s
                custom_nodes folder and restart ComfyUI.{' '}
                {report.system?.comfyuiVersion
                  ? `This ComfyUI: ${report.system.comfyuiVersion}, Python ${report.system.pythonVersion ?? '?'}, ${report.system.os ?? 'unknown OS'}${report.system.embeddedPython ? ' (portable, python_embeded)' : ''}.`
                  : ''}
                {status?.installedAs === 'file'
                  ? ' It is installed that way now, so copying the new file over it updates it.'
                  : ''}
              </p>
              {recommended.map(command => (
                <CommandBlock key={command.id} command={command} onCopy={copy} />
              ))}
              <p className="type-caption text-[var(--text-muted)]">
                Or{' '}
                <a
                  href={CASTCUT_NODES_FILE_ROUTE}
                  download={CASTCUT_NODES_FILE_NAME}
                  className="ui-text-link"
                >
                  download {CASTCUT_NODES_FILE_NAME}
                </a>{' '}
                and copy it there yourself.
                {report.needsAuth
                  ? " The commands need an API key (Profile → API keys, or the server's PROMPT_API_TOKEN) in place of <API key>."
                  : ''}
              </p>
              {others.length > 0 ? (
                <details className="space-y-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">
                    Other ways (wget, git, comfy-cli, Docker)
                  </summary>
                  <div className="mt-3 space-y-3">
                    {others.map(command => (
                      <CommandBlock key={command.id} command={command} onCopy={copy} />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </details>
        ) : null}

        <p className="type-caption text-[var(--text-muted)]">
          <a
            href={CASTCUT_NODES_DOCS_URL}
            className="ui-text-link"
            target="_blank"
            rel="noreferrer"
          >
            About the Castcut nodes
          </a>
        </p>
      </div>
    </ToolSection>
  );
}
