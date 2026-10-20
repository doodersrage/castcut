'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { queueCastLookPlate } from '@/lib/cast/plate-queue';
import { loadSettingsCache } from '@/lib/settings-cache';

/**
 * "Generate plate" on Cast home's Looks: a Cast's first plate is rendered from the description on
 * UltraReal (the same plate Day's "Make a plate from the description" makes); every later plate is
 * edited from that original on Edit 2511, with an optional note for what the look changes. The current plate stays until the new one lands. Loaded lazily — it
 * owns a ComfyUI queue hook the rest of Cast home never needs.
 */
export default function CastLookGenerateControl({
  characterId,
  lookId,
  lookName,
  hasPlate,
  disabled,
  onStatus,
}: {
  characterId: string;
  lookId?: string;
  lookName?: string;
  hasPlate: boolean;
  disabled: boolean;
  onStatus: (status: string) => void;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'fitting', model });
  const [open, setOpen] = useState(!hasPlate);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const { result } = await queueCastLookPlate({
        characterId,
        lookId,
        lookNote: note,
        sendComfyUi: actions.sendComfyUi,
      });
      onStatus(
        result === 'queued'
          ? `Rendering a plate for ${lookName ? `“${lookName}”` : 'this look'} — it replaces the plate when it lands.`
          : 'Could not queue a plate — check ComfyUI, then try again.'
      );
      if (result === 'queued') setOpen(false);
    } catch {
      onStatus('Could not queue a plate — check ComfyUI, then try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || busy}
        data-testid="cast-look-generate-open"
        title="Render a new plate for this look from the Cast's description and face"
        onClick={() => setOpen(true)}
      >
        {hasPlate ? 'Generate new plate' : 'Generate plate'}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-end gap-2" data-testid="cast-look-generate">
      <label className="min-w-[14rem] flex-1 text-left">
        <span className="type-caption text-[var(--text-muted)]">
          What this look changes (optional) — hair, makeup; clothes come from its outfit lock
        </span>
        <TextInput
          value={note}
          maxLength={300}
          placeholder="e.g. short copper bob, winged eyeliner"
          data-testid="cast-look-generate-note"
          onChange={event => setNote(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !busy && !disabled) void generate();
          }}
        />
      </label>
      <Button
        variant={hasPlate ? 'secondary' : 'primary'}
        size="sm"
        disabled={disabled || busy}
        data-testid="cast-look-generate"
        onClick={() => void generate()}
      >
        {busy ? 'Queueing…' : 'Generate'}
      </Button>
      {hasPlate ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
