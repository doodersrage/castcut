'use client';

import { useState } from 'react';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import type { ComfyInputFolderReport } from '@/lib/comfy-input-cleanup';
import { formatBytes } from '@/lib/model-files';

export type SettingsComfyInputFolderPanelProps = {
  comfyUrl?: string;
  setStatus: (status: string | null) => void;
};

/**
 * Report only. ComfyUI has no API to delete inputs and its folder belongs to the ComfyUI user,
 * so the app lists what it made that nothing uses and hands over a command — it never runs it.
 */
export default function SettingsComfyInputFolderPanel({
  comfyUrl,
  setStatus,
}: SettingsComfyInputFolderPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ComfyInputFolderReport | null>(null);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const { collectBrowserInputReferences } = await import('@/lib/comfy-input-references-client');
      const references = await collectBrowserInputReferences();
      const response = await fetch('/api/comfyui/input-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references, ...(comfyUrl?.trim() ? { comfyUrl } : {}) }),
      });
      const data = (await response.json()) as ComfyInputFolderReport & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `Scan failed (HTTP ${response.status}).`);
      }
      setReport(data);
    } catch (scanError) {
      setReport(null);
      setError(scanError instanceof Error ? scanError.message : 'Scan failed.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCommand() {
    if (!report?.command) return;
    try {
      await navigator.clipboard.writeText(report.command);
      setStatus(`Copied a command that removes ${report.removable.length} files.`);
    } catch {
      setStatus('Could not copy — select the command and copy it by hand.');
    }
  }

  return (
    <CollapsibleSection
      title="Input folder"
      summary="Pictures the app uploaded to ComfyUI that nothing uses any more"
      defaultOpen={false}
      persistKey="settings-comfyui-input-folder"
    >
      <ToolSection id="settings-comfyui-input-folder" title="Input folder">
        <p className="text-sm text-[var(--text-secondary)]">
          Plates, cut-outs, face crops and pose maps the app sent to ComfyUI stay in its input
          folder. Scan lists the ones no gallery entry, Cast look, Day or Story, or queued job
          names, older than a week. ComfyUI cannot delete inputs, so you get a command to review and
          run yourself — the app never deletes anything there.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void scan()} disabled={busy}>
            {busy ? 'Scanning…' : report ? 'Scan again' : 'Scan input folder'}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {report ? (
          <div className="space-y-3" aria-live="polite">
            <p className="text-sm text-[var(--text-primary)]">
              {report.totalFiles.toLocaleString()} files in{' '}
              <code className="break-all">{report.inputDir ?? 'the input folder'}</code>;{' '}
              {report.appMadeCount.toLocaleString()} made by the app (
              {formatBytes(report.appMadeBytes)}), {report.referencedCount.toLocaleString()} still
              in use.
            </p>
            {!report.sources.comfyQueue ? (
              <p className="text-sm text-[var(--warning)]">
                ComfyUI&apos;s queue could not be read, so nothing is offered for removal.
              </p>
            ) : report.removable.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Nothing to remove
                {report.tooNewCount > 0
                  ? ` — ${report.tooNewCount} unused files are newer than ${report.minAgeDays} days and stay.`
                  : '.'}
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-primary)]">
                  <strong>{report.removable.length.toLocaleString()} unused files</strong> (
                  {formatBytes(report.removableBytes)}) can go
                  {report.tooNewCount > 0
                    ? `; ${report.tooNewCount} newer than ${report.minAgeDays} days stay`
                    : ''}
                  .
                </p>
                <ul className="type-caption grid gap-x-4 gap-y-0.5 text-[var(--text-muted)] sm:grid-cols-2">
                  {report.byCategory.map(group => (
                    <li key={group.category} className="flex justify-between gap-2">
                      <span className="truncate">{group.category}</span>
                      <span className="shrink-0 tabular-nums">
                        {group.count} · {formatBytes(group.bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="type-caption text-[var(--text-muted)]">
                  {report.writable
                    ? 'Run it in a terminal on the ComfyUI machine.'
                    : 'The folder belongs to the ComfyUI service, so run it as that user (for example with sudo -u and the folder’s owner) on the ComfyUI machine.'}{' '}
                  Read it first: it removes exactly these files and nothing else.
                </p>
                <textarea
                  readOnly
                  aria-label="Command that removes the unused input files"
                  value={report.command}
                  rows={6}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2 font-mono text-xs text-[var(--text-primary)]"
                  onFocus={event => event.currentTarget.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void copyCommand()}>
                    Copy command
                  </Button>
                </div>
              </>
            )}
            {!report.sources.serverStorage ? (
              <p className="type-caption text-[var(--text-muted)]">
                Server storage is off: only this browser&apos;s saved data was checked. Other
                browsers using this ComfyUI may still need some of these files.
              </p>
            ) : null}
          </div>
        ) : null}
      </ToolSection>
    </CollapsibleSection>
  );
}
