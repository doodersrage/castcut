'use client';

import InpaintMaskEditor from '@/components/InpaintMaskEditor';
import RegionalEditPanel from '@/components/RegionalEditPanel';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import {
  CLOUD_COMPOSE_SINGLE_REF_WARNING,
  isCloudMultiRefEditModel,
} from '@/lib/cloud/cloud-compose-refs';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { isBooguEditModel, isFluxKleinModel } from '@/lib/model/denoise-defaults';
import { normalizeTurboEditStrength } from '@/lib/engine/turbo-edit-strength';
import { Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING } from '@/lib/prompt/compose-prompt';
import {
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
  type ComposeIdentityKind,
} from '@/lib/prompt/compose-identity-lock';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import type { useComposeToolOrchestration } from '@/hooks/useComposeToolOrchestration';

const ACCENT = 'cyan' as const;

type Props = Pick<
  ReturnType<typeof useComposeToolOrchestration>,
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'maskPreviewUrl'
  | 'showMaskEditor'
  | 'setShowMaskEditor'
  | 'cloudComposeSingleRef'
  | 'cloudComposeModelId'
  | 'onMaskChange'
  | 'identityLock'
  | 'identityLockStrength'
  | 'identityKind'
  | 'identityLockHint'
  | 'regionalSlots'
  | 'fig1Preview'
  | 'booguEditModel'
  | 'zImageModel'
>;

export function ComposeToolIdentityMaskSection({
  shared,
  updateShared,
  updateToolSettings,
  maskPreviewUrl,
  showMaskEditor,
  setShowMaskEditor,
  cloudComposeSingleRef,
  cloudComposeModelId,
  onMaskChange,
  identityLock,
  identityLockStrength,
  identityKind,
  identityLockHint,
  regionalSlots,
  fig1Preview,
  zImageModel,
}: Props) {
  const cloudEngine = isCloudEngine(shared.inferenceEngine);
  const cloudMultiRef = isCloudMultiRefEditModel(shared.inferenceEngine, cloudComposeModelId);

  return (
    <>
      {isFluxKleinModel(shared.model) ? (
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Klein: instruction edit via ReferenceLatent (denoise 1). Write a short command — e.g.
          “Replace the background with a rainy neon alley. Keep the subject’s pose and framing.”
          Distilled is 4-step CFG 1 — use Gentle / Balanced / Strong so it does not rewrite the
          frame.
        </p>
      ) : zImageModel ? (
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
          {Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING} Figure 1 is VAEEncode img2img. Turbo uses Gentle /
          Balanced / Strong so identity holds. There is no vision-encode node for extras — do not
          expect Image 2–4 to be sampled.
        </p>
      ) : isBooguEditModel(shared.model) ? (
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Boogu Edit: TextEncodeBooguEdit vision-encodes Image 1–4. Write a short instruction and
          name Image 1, Image 2, etc. Denoise stays 1 — Turbo strength wraps the prompt instead.
        </p>
      ) : null}
      <TurboEditStrengthControls
        model={shared.model}
        tool="compose"
        value={normalizeTurboEditStrength(shared.turboEditStrength)}
        onChange={turboEditStrength => updateShared({ turboEditStrength })}
      />
      {cloudComposeSingleRef ? (
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
          {CLOUD_COMPOSE_SINGLE_REF_WARNING} Use Fal Kontext multi / FLUX.2 edit or Replicate
          multi-image Kontext as the image-to-image model to attach Image 2–4, or queue on local
          Comfy.
        </p>
      ) : null}

      {cloudEngine ? (
        <div className="ui-recipe-shell space-y-2" data-testid="compose-cloud-face-ref">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-badge" data-tone="warning">
              Cloud face-ref
            </span>
            <span className="ui-badge" data-tone={cloudMultiRef ? 'success' : 'accent'}>
              {cloudMultiRef ? 'Multi-ref imgs' : 'Prompt-only identity'}
            </span>
            <span className="ui-badge" data-tone="accent">
              No IP-Adapter
            </span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={identityLock}
                onChange={event => updateToolSettings({ identityLock: event.target.checked })}
                className="ui-checkbox mt-1 accent-[var(--accent)]"
              />
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium text-[var(--accent-text)]">
                  Lock identity (cloud face-ref)
                </span>
                <span className="block text-xs leading-relaxed text-[var(--text-muted)]">
                  {identityLockHint}
                </span>
              </span>
            </label>
          </div>
          {identityLock ? (
            <label className="block space-y-1.5 pl-7">
              <span className="type-caption text-[var(--accent-text)]">
                Face-ref strength — {identityLockStrength.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.15}
                max={0.85}
                step={0.05}
                value={identityLockStrength}
                onChange={event =>
                  updateToolSettings({
                    identityLockStrength: normalizeComposeIdentityLockStrength(event.target.value),
                  })
                }
                className="w-full accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              />
            </label>
          ) : null}
        </div>
      ) : !zImageModel ? (
        <div className="ui-recipe-shell space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-badge" data-tone="success">
              Local IP-Adapter
            </span>
            <span className="ui-badge" data-tone="accent">
              InstantID / PuLID
            </span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={identityLock}
                onChange={event => updateToolSettings({ identityLock: event.target.checked })}
                className="ui-checkbox mt-1 accent-[var(--accent)]"
              />
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium text-[var(--accent-text)]">
                  Lock identity from Image 1
                </span>
                <span className="block text-xs leading-relaxed text-[var(--text-muted)]">
                  {identityLockHint}
                </span>
              </span>
            </label>
            <label className="shrink-0 space-y-1">
              <span className="type-caption text-[var(--accent-text)]">Kind</span>
              <select
                value={identityKind}
                disabled={!identityLock}
                onChange={event =>
                  updateToolSettings({
                    identityKind: normalizeComposeIdentityKind(event.target.value),
                  })
                }
                className="block rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/70 px-2.5 py-1.5 text-sm text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {(
                  [
                    { id: 'ipadapter' as const, label: 'IP-Adapter' },
                    { id: 'instantid' as const, label: 'InstantID' },
                    { id: 'pulid' as const, label: 'PuLID' },
                    { id: 'auto' as const, label: 'Auto' },
                  ] satisfies Array<{ id: ComposeIdentityKind; label: string }>
                ).map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {identityLock ? (
            <label className="block space-y-1.5 pl-7">
              <span className="type-caption text-[var(--accent-text)]">
                {identityKind === 'ipadapter'
                  ? 'IP-Adapter'
                  : identityKind === 'instantid'
                    ? 'InstantID'
                    : identityKind === 'pulid'
                      ? 'PuLID'
                      : 'Identity'}{' '}
                strength — {identityLockStrength.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.15}
                max={0.85}
                step={0.05}
                value={identityLockStrength}
                onChange={event =>
                  updateToolSettings({
                    identityLockStrength: normalizeComposeIdentityLockStrength(event.target.value),
                  })
                }
                className="w-full accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowMaskEditor((value: boolean) => !value)}
          disabled={!fig1Preview}
          className={[
            'rounded-xl border px-3 py-2 text-sm transition',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-40',
            showMaskEditor
              ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]',
          ].join(' ')}
        >
          {showMaskEditor ? 'Hide optional mask' : 'Optional mask on Image 1'}
        </button>
        {maskPreviewUrl ? (
          <span className="text-xs text-[var(--text-muted)]">Mask ready</span>
        ) : null}
      </div>

      {showMaskEditor && fig1Preview ? (
        <InpaintMaskEditor
          key={fig1Preview}
          sourceImageUrl={fig1Preview}
          onMaskChange={onMaskChange}
        />
      ) : null}

      <RegionalEditPanel
        slots={regionalSlots}
        onSlotsChange={next => updateToolSettings({ regionalSlots: next })}
        sourceImageUrl={fig1Preview}
        accentClassName={accentFocusClass(ACCENT)}
        persistKey="compose-regional-edit"
      />
    </>
  );
}
