'use client';

import type { SharedPresetEntry } from '@/lib/storage/shared-preset-store';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';

export type UsersAdminSharedPresetsPanelProps = {
  sharedPresets: SharedPresetEntry[];
  sharedPresetDraft: { label: string; hints: string; category: string };
  setSharedPresetDraft: React.Dispatch<
    React.SetStateAction<{ label: string; hints: string; category: string }>
  >;
  onPublishPreset: () => void | Promise<void>;
  onDeletePreset: (id: string) => void | Promise<void>;
};

export default function UsersAdminSharedPresetsPanel({
  sharedPresets,
  sharedPresetDraft,
  setSharedPresetDraft,
  onPublishPreset,
  onDeletePreset,
}: UsersAdminSharedPresetsPanelProps) {
  return (
    <ToolSection title="Shared preset library">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Publish read-only scene hints for all users. They appear on Profile and can be copied.
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <TextInput
          value={sharedPresetDraft.label}
          onChange={event => setSharedPresetDraft(prev => ({ ...prev, label: event.target.value }))}
          placeholder="Preset label"
        />
        <TextInput
          value={sharedPresetDraft.hints}
          onChange={event => setSharedPresetDraft(prev => ({ ...prev, hints: event.target.value }))}
          placeholder="Hints text"
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="mb-4"
        onClick={() => void onPublishPreset()}
      >
        Publish preset
      </Button>
      <ul className="space-y-2">
        {sharedPresets.map(preset => (
          <li
            key={preset.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-[var(--text-primary)]">{preset.label}</p>
              <p className="text-xs text-[var(--text-muted)]">{preset.hints}</p>
            </div>
            <button
              type="button"
              className="text-xs ui-status-danger"
              onClick={() => void onDeletePreset(preset.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </ToolSection>
  );
}
