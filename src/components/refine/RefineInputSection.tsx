'use client';

import InpaintMaskEditor from '@/components/InpaintMaskEditor';
import RegionalEditPanel from '@/components/RegionalEditPanel';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { resolveCollabFieldValue } from '@/lib/collab-presence';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { isBooguEditModel, isZImageModel } from '@/lib/model-denoise-defaults';
import { isKleinDistilledModel } from '@/lib/model-sampler-defaults';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { ToolSection, accentButtonClass, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import type { useRefineToolOrchestration } from '@/hooks/useRefineToolOrchestration';

const ACCENT = 'fuchsia' as const;

type RefineInputSectionProps = Pick<
  ReturnType<typeof useRefineToolOrchestration>,
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'file'
  | 'previewUrl'
  | 'needsInpaintMask'
  | 'regionalSlots'
  | 'currentPrompt'
  | 'intentHints'
  | 'setCurrentPrompt'
  | 'setIntentHints'
  | 'loading'
  | 'scanning'
  | 'error'
  | 'onMaskChange'
  | 'onFileChange'
  | 'scanWithVision'
  | 'refine'
>;

export default function RefineInputSection({
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  file,
  previewUrl,
  needsInpaintMask,
  regionalSlots,
  currentPrompt,
  intentHints,
  setCurrentPrompt,
  setIntentHints,
  loading,
  scanning,
  error,
  onMaskChange,
  onFileChange,
  scanWithVision,
  refine,
}: RefineInputSectionProps) {
  return (
    <>
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.refine} />
      <EditToolRecipeStrip toolId="refine" shared={shared} onApplied={next => updateShared(next)} />
      <HistoryHintSeedPanel
        tool="refine"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={intentHints}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setIntentHints}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            intentHints: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <CollabPresenceBar
        tool="refine"
        draft={[intentHints, currentPrompt].filter(Boolean).join('\n\n')}
        draftFields={{ hints: intentHints, positive: currentPrompt }}
        onApplyRemoteDraft={payload => {
          const hints = resolveCollabFieldValue(payload, 'hints');
          const positive = resolveCollabFieldValue(payload, 'positive');
          if (hints || positive) {
            updateToolSettings({
              ...(hints ? { intentHints: hints } : {}),
              ...(positive ? { currentPrompt: positive } : {}),
            });
            return;
          }
          const parts = payload.draft.split(/\n\n+/);
          updateToolSettings({
            intentHints: parts[0] ?? payload.draft,
            currentPrompt: parts.slice(1).join('\n\n') || toolSettings.currentPrompt,
          });
        }}
      />
      <ToolSection>
        {isBooguEditModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Boogu Edit: TextEncodeBooguEdit vision-encodes your reference at denoise 1 — write a
            short instruction (e.g. &quot;Replace the background with a rainy neon alley. Keep the
            subject&apos;s pose.&quot;). Full scene essays rewrite too much on Turbo.
          </p>
        ) : isZImageModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Z-Image: VAEEncode img2img on your reference. Turbo defaults to a soft denoise so
            identity holds — use Gentle / Balanced / Strong instead of the Settings 0.65 slider.
          </p>
        ) : isKleinDistilledModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Klein Distilled: ReferenceLatent instruction edit at denoise 1 (4-step CFG 1). Write a
            short command and use Gentle / Balanced / Strong — full scene essays rewrite the frame.
          </p>
        ) : null}
        <TurboEditStrengthControls
          model={shared.model}
          tool="refine"
          value={normalizeTurboEditStrength(shared.turboEditStrength)}
          onChange={turboEditStrength => updateShared({ turboEditStrength })}
        />
        <FieldLabel>Reference image</FieldLabel>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              aria-label="Choose an image file"
              accept="image/*"
              onChange={event => onFileChange(event.target.files?.[0] ?? null)}
              className="ui-file-input block min-w-[14rem] flex-1"
            />
            <ButtonLink href={galleryPickPath('refine')} variant="secondary" size="sm">
              Choose from Gallery
            </ButtonLink>
            <Button
              variant="secondary"
              size="sm"
              disabled={(!file && !previewUrl) || scanning || loading}
              loading={scanning}
              loadingLabel="Scanning still"
              onClick={() => void scanWithVision()}
            >
              Scan with vision
            </Button>
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Scan with vision fills Current prompt from the still. Add intent hints, then Refine.
          </p>
        </div>
        {previewUrl && !needsInpaintMask ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Reference preview"
            className="max-h-64 rounded-xl border border-[var(--border-subtle)] object-contain"
          />
        ) : null}

        {needsInpaintMask && previewUrl ? (
          <InpaintMaskEditor
            key={previewUrl}
            sourceImageUrl={previewUrl}
            onMaskChange={onMaskChange}
          />
        ) : needsInpaintMask ? (
          <p className="rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5 text-xs text-[var(--tint-warning-text)]">
            Upload a reference image first, then draw or upload an inpaint mask.
          </p>
        ) : null}

        <RegionalEditPanel
          slots={regionalSlots}
          onSlotsChange={next => updateToolSettings({ regionalSlots: next })}
          sourceImageUrl={previewUrl}
          accentClassName={accentFocusClass(ACCENT)}
          persistKey="refine-regional-edit"
        />

        <FieldLabel>Current prompt (optional)</FieldLabel>
        <TextArea
          rows={4}
          value={currentPrompt}
          onChange={event => setCurrentPrompt(event.target.value)}
          placeholder="Paste the prompt you want corrected…"
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        <FieldLabel>Intent hints</FieldLabel>
        <TextArea
          rows={3}
          value={intentHints}
          onChange={event => setIntentHints(event.target.value)}
          placeholder="What you wanted: gravel cyclists with helmets, muddy doubletrack, no street clothes…"
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => void refine()}
          disabled={(!file && !previewUrl) || scanning}
          loading={loading}
          loadingLabel="Refining prompt"
        >
          Refine prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>
    </>
  );
}
