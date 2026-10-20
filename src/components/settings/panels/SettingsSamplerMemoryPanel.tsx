'use client';

import type { SharedToolSettings } from '@/lib/settings/cache';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { Button } from '@/components/ui/Button';

export type SettingsSamplerMemoryPanelProps = {
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  setStatus: (status: string | null) => void;
};

export default function SettingsSamplerMemoryPanel({
  sharedSettings,
  updateSharedSettings,
  setStatus,
}: SettingsSamplerMemoryPanelProps) {
  const memory = sharedSettings.modelSamplerMemory ?? {};
  const entries = Object.entries(memory).sort(([a], [b]) => a.localeCompare(b));

  return (
    <CollapsibleSection
      title="Sampler memory"
      summary="Per-model CFG/steps remembered from 4–5★ ratings."
      defaultOpen={false}
      persistKey="settings-comfyui-sampler-memory"
    >
      <ToolSection id="settings-comfyui-sampler-memory" title="Sampler memory">
        <p className="text-sm text-[var(--text-secondary)]">
          4–5★ gallery ratings remember per-model CFG / steps / sampler / scheduler for the next
          queue (Lightning and Rapid AIO stay CFG-1).
        </p>
        {entries.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="No sampler memory yet"
            description="Rate a completed gallery image 4–5★ to remember its sampler params for that model."
          />
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  updateSharedSettings({ modelSamplerMemory: {} });
                  setStatus('Cleared all sampler memory.');
                }}
              >
                Clear all
              </Button>
            </div>
            <ul className="space-y-2">
              {entries.map(([model, remembered]) => (
                <li
                  key={model}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm text-[var(--text-primary)]">{model}</p>
                    <p className="type-caption text-[var(--text-muted)]">
                      {[
                        remembered.cfg ? `CFG ${remembered.cfg}` : null,
                        remembered.steps ? `${remembered.steps} steps` : null,
                        remembered.samplerName,
                        remembered.scheduler,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = { ...(sharedSettings.modelSamplerMemory ?? {}) };
                      delete next[model];
                      updateSharedSettings({ modelSamplerMemory: next });
                      setStatus(`Cleared sampler memory for ${model}.`);
                    }}
                  >
                    Clear
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ToolSection>
    </CollapsibleSection>
  );
}
